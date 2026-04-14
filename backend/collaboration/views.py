"""
Collaboration views — Git/GitHub-inspired research collaboration.
"""
import hashlib
import io
import os
import re
import tarfile
import time
import zipfile
from django.db import transaction
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework import generics, status, permissions
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from code_execution.executor import execute_code
from .models import (
    CollabProject, ProjectMember, Issue, IssueComment,
    MergeRequest, MRComment, Commit, Notification, CollabProjectFile,
)
from .serializers import (
    CollabProjectSerializer, ProjectMemberSerializer,
    IssueSerializer, IssueCommentSerializer,
    MergeRequestSerializer, MRCommentSerializer,
    CommitSerializer, NotificationSerializer,
    CollabProjectFileSerializer,
)

User = get_user_model()

MAX_IMPORTED_FILES = 600
MAX_IMPORTED_FILE_BYTES = 512 * 1024

TEXT_FILE_EXTENSIONS = {
    'py', 'js', 'jsx', 'ts', 'tsx',
    'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'rb', 'php',
    'html', 'htm', 'css', 'scss', 'less',
    'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
    'md', 'txt', 'rst', 'csv', 'tsv',
    'sh', 'bash', 'sql', 'r', 'env',
    'dockerfile', 'makefile', 'gitignore', 'gitattributes',
}

LANGUAGE_BY_EXTENSION = {
    'py': 'python', 'js': 'javascript', 'jsx': 'javascript',
    'ts': 'typescript', 'tsx': 'typescript',
    'java': 'java', 'c': 'c', 'cpp': 'cpp', 'h': 'cpp', 'hpp': 'cpp',
    'cs': 'csharp', 'go': 'go', 'rs': 'rust', 'rb': 'ruby', 'php': 'php',
    'html': 'html', 'htm': 'html', 'css': 'css', 'scss': 'scss', 'less': 'less',
    'json': 'json', 'xml': 'xml', 'yaml': 'yaml', 'yml': 'yaml',
    'toml': 'toml', 'ini': 'ini', 'cfg': 'ini', 'conf': 'ini',
    'md': 'markdown', 'txt': 'plaintext', 'rst': 'plaintext', 'csv': 'plaintext', 'tsv': 'plaintext',
    'sh': 'shell', 'bash': 'shell', 'sql': 'sql', 'r': 'r',
    'env': 'properties', 'dockerfile': 'dockerfile', 'makefile': 'makefile',
    'gitignore': 'plaintext', 'gitattributes': 'plaintext',
}


def _to_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in ('1', 'true', 'yes', 'y', 'on')
    return default


def _normalize_workspace_path(path):
    normalized = (path or '').replace('\\', '/').strip().lstrip('/')
    while '//' in normalized:
        normalized = normalized.replace('//', '/')
    return normalized


def _is_text_file(path):
    normalized = _normalize_workspace_path(path)
    if not normalized:
        return False
    name = normalized.rsplit('/', 1)[-1].lower()
    if name in ('dockerfile', 'makefile', '.gitignore', '.gitattributes', '.env'):
        return True
    ext = name.rsplit('.', 1)[-1] if '.' in name else ''
    return ext in TEXT_FILE_EXTENSIONS


def _infer_language(path):
    normalized = _normalize_workspace_path(path)
    name = normalized.rsplit('/', 1)[-1].lower()
    if name in ('dockerfile', 'makefile'):
        return name
    if name in ('.gitignore', '.gitattributes', '.env'):
        return LANGUAGE_BY_EXTENSION.get(name.lstrip('.'), 'plaintext')
    ext = name.rsplit('.', 1)[-1] if '.' in name else ''
    return LANGUAGE_BY_EXTENSION.get(ext, 'plaintext')


def _decode_to_text(raw):
    if raw is None:
        return ''
    return raw.decode('utf-8', errors='replace')


def _extract_workspace_from_repository_file(output_file):
    """
    Build a workspace map from the latest repository version.
    Returns:
      files_map: {path: {'content': str, 'language': str}}
      imported_count, skipped_count, truncated (bool)
    """
    file_path = output_file.file.path
    files_map = {}
    skipped = 0
    truncated = False

    def add_candidate(path, raw_bytes):
        nonlocal skipped, truncated
        normalized = _normalize_workspace_path(path)
        if not normalized or normalized.endswith('/'):
            return
        if not _is_text_file(normalized):
            skipped += 1
            return
        if raw_bytes is None:
            skipped += 1
            return
        if len(raw_bytes) > MAX_IMPORTED_FILE_BYTES:
            skipped += 1
            return
        if len(files_map) >= MAX_IMPORTED_FILES:
            truncated = True
            return
        files_map[normalized] = {
            'content': _decode_to_text(raw_bytes),
            'language': _infer_language(normalized),
        }

    if zipfile.is_zipfile(file_path):
        with zipfile.ZipFile(file_path, 'r') as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                path = _normalize_workspace_path(info.filename)
                if not path or path.startswith('__MACOSX/'):
                    continue
                raw = zf.read(info.filename)
                add_candidate(path, raw)
    elif tarfile.is_tarfile(file_path):
        with tarfile.open(file_path, 'r:*') as tf:
            for member in tf.getmembers():
                if not member.isfile():
                    continue
                path = _normalize_workspace_path(member.name)
                if not path:
                    continue
                extracted = tf.extractfile(member)
                raw = extracted.read() if extracted else None
                add_candidate(path, raw)
    else:
        with open(file_path, 'rb') as fh:
            raw = fh.read(MAX_IMPORTED_FILE_BYTES + 1)
        if len(raw) > MAX_IMPORTED_FILE_BYTES:
            skipped += 1
        else:
            name = _normalize_workspace_path(output_file.original_filename or os.path.basename(file_path) or 'main.txt')
            add_candidate(name, raw)

    return files_map, len(files_map), skipped, truncated


def import_repository_to_workspace(project, repository, actor, overwrite=True, clear_workspace=False):
    latest = repository.files.order_by('-version').first()
    if not latest:
        raise ValidationError('Selected repository has no versions to import.')

    if not latest.file or not os.path.exists(latest.file.path):
        raise ValidationError('Latest repository file is not available on the server.')

    workspace_map, imported_count, skipped_count, truncated = _extract_workspace_from_repository_file(latest)
    if not workspace_map:
        raise ValidationError('No editable text files were found in the selected repository version.')

    existing = {f.path: f for f in project.ide_files.all()}
    deleted_count = 0
    updated_count = 0
    created_count = 0

    if clear_workspace:
        keep_paths = set(workspace_map.keys())
        deleted_count, _ = CollabProjectFile.objects.filter(project=project).exclude(path__in=keep_paths).delete()

    for path, payload in workspace_map.items():
        current = existing.get(path)
        if current:
            if overwrite:
                changed = False
                new_content = payload['content']
                new_language = payload['language']
                if current.content != new_content:
                    current.content = new_content
                    changed = True
                if current.language != new_language:
                    current.language = new_language
                    changed = True
                if current.last_edited_by_id != actor.id:
                    current.last_edited_by = actor
                    changed = True
                if changed:
                    current.save()
                    updated_count += 1
            continue

        CollabProjectFile.objects.create(
            project=project,
            path=path,
            content=payload['content'],
            language=payload['language'],
            created_by=actor,
            last_edited_by=actor,
        )
        created_count += 1

    return {
        'imported_files': imported_count,
        'created_files': created_count,
        'updated_files': updated_count,
        'deleted_files': deleted_count,
        'skipped_files': skipped_count,
        'truncated': truncated,
    }


def ensure_linkable_repository(project, repository, actor):
    if not repository or repository.is_deleted:
        raise ValidationError('Repository is not available.')
    # Keep repository collaboration scoped to the project owner unless admin.
    if actor.role != 'admin' and repository.created_by_id != project.owner_id:
        raise ValidationError('You can only link repositories owned by the project owner.')


# ── helpers ───────────────────────────────────────────────────────────────────

def is_member(project, user):
    return project.members.filter(user=user).exists() or project.owner == user


def get_member_role(project, user):
    if project.owner == user:
        return 'owner'
    m = project.members.filter(user=user).first()
    return m.role if m else None


def can_write(project, user):
    role = get_member_role(project, user)
    return role in ('owner', 'contributor')


def notify(project, actor, notif_type, message, object_id=None):
    """Send in-app notification to all members except the actor."""
    recipients = set()
    for m in project.members.select_related('user'):
        recipients.add(m.user)
    recipients.add(project.owner)
    recipients.discard(actor)

    notifs = [
        Notification(
            recipient=r,
            actor=actor,
            notif_type=notif_type,
            project=project,
            object_id=object_id,
            message=message,
        )
        for r in recipients
    ]
    Notification.objects.bulk_create(notifs)


def sync_workspace_to_repository(project, actor, title=None, description=None, allow_empty=False, change_notes=None):
    """
    Create/update the linked repository with the current IDE workspace as a ZIP version.
    Returns: (repository, version, file_count)
    """
    from django.core.files.base import ContentFile
    from repository.models import Repository, RepositoryFile

    ide_files = list(project.ide_files.all())
    if not ide_files and not allow_empty:
        return None, 0, 0

    repo = project.linked_repository
    if repo and repo.is_deleted:
        repo = None

    base_title = (title or (repo.title if repo else project.name) or 'collab_workspace').strip() or 'collab_workspace'
    zip_filename = f"{base_title.replace(' ', '_')}.zip"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        if ide_files:
            for f in ide_files:
                zf.writestr(f.path, f.content or '')
        else:
            zf.writestr(
                'README.md',
                f'# {project.name}\n\nWorkspace initialized from Collaboration Hub.\n'
            )
    buf.seek(0)
    zip_bytes = buf.read()

    if not repo:
        repo = Repository.objects.create(
            title=base_title,
            description=(description or project.description or '').strip(),
            # Keep project ownership consistent for collaboration workflows.
            created_by=project.owner,
        )
        project.linked_repository = repo
        project.save(update_fields=['linked_repository'])
        new_version = 1
    else:
        latest = repo.files.order_by('-version').first()
        new_version = (latest.version + 1) if latest else 1
        update_fields = ['updated_at']
        if title is not None and title.strip():
            repo.title = title.strip()
            update_fields.append('title')
        if description is not None:
            repo.description = description
            update_fields.append('description')
        repo.save(update_fields=list(dict.fromkeys(update_fields)))

    notes = (change_notes or '').strip() or (
        'Initial publish from Collaboration workspace'
        if new_version == 1 else
        f'Published from Collaboration workspace (v{new_version})'
    )

    RepositoryFile.objects.create(
        repository=repo,
        file=ContentFile(zip_bytes, name=zip_filename),
        original_filename=zip_filename,
        file_size=len(zip_bytes),
        version=new_version,
        change_notes=notes,
        uploaded_by=actor,
    )

    return repo, new_version, len(ide_files)


def build_workspace_map(project):
    return {f.path: (f.content or '') for f in project.ide_files.all()}


def resolve_workspace_entry(workspace, requested_path, preferred_names):
    if requested_path and requested_path in workspace:
        return requested_path

    lower_lookup = {path.lower(): path for path in workspace}
    for name in preferred_names:
        if name.lower() in lower_lookup:
            return lower_lookup[name.lower()]

    for path in workspace:
        if path.lower().endswith(tuple(name.lower() for name in preferred_names)):
            return path
    return None


def inline_workspace_html(workspace, entry_path):
    html = workspace[entry_path]

    def replace_css(match):
        href = (match.group(1) or match.group(2) or '').strip()
        if href.startswith(('http://', 'https://', '//')):
            return match.group(0)
        css = workspace.get(href)
        if css is None:
            return match.group(0)
        return f'<style data-inline-source="{href}">\n{css}\n</style>'

    def replace_js(match):
        src = (match.group(1) or match.group(2) or '').strip()
        if src.startswith(('http://', 'https://', '//')):
            return match.group(0)
        js = workspace.get(src)
        if js is None:
            return match.group(0)
        return f'<script data-inline-source="{src}">\n{js}\n</script>'

    html = re.sub(
        r'<link[^>]+href=["\']([^"\']+)["\'][^>]*rel=["\']stylesheet["\'][^>]*>|'
        r'<link[^>]+rel=["\']stylesheet["\'][^>]*href=["\']([^"\']+)["\'][^>]*>',
        replace_css,
        html,
        flags=re.IGNORECASE,
    )
    html = re.sub(
        r'<script[^>]+src=["\']([^"\']+)["\'][^>]*>\s*</script>|'
        r'<script[^>]*>\s*</script>',
        replace_js,
        html,
        flags=re.IGNORECASE,
    )

    error_bridge = """
<script>
window.addEventListener('error', function (event) {
  console.error(event.message || 'Runtime error');
});
window.addEventListener('unhandledrejection', function (event) {
  console.error(event.reason || 'Unhandled promise rejection');
});
</script>
""".strip()

    if '</head>' in html.lower():
        return re.sub(r'</head>', f'{error_bridge}\n</head>', html, count=1, flags=re.IGNORECASE)
    return f'{error_bridge}\n{html}'


# ── Projects ──────────────────────────────────────────────────────────────────

class ProjectListCreateView(generics.ListCreateAPIView):
    serializer_class = CollabProjectSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        member_ids = ProjectMember.objects.filter(user=user).values_list('project_id', flat=True)
        return CollabProject.objects.filter(
            status='active'
        ).filter(
            **{'id__in': list(member_ids)}
        ).union(
            CollabProject.objects.filter(owner=user, status='active')
        ).order_by('-updated_at')

    def perform_create(self, serializer):
        linked_repo = serializer.validated_data.get('linked_repository')

        with transaction.atomic():
            project = serializer.save(owner=self.request.user)
            # Auto-add owner as member
            ProjectMember.objects.get_or_create(
                project=project,
                user=self.request.user,
                defaults={'role': 'owner'}
            )

            if linked_repo:
                ensure_linkable_repository(project, linked_repo, self.request.user)
                sync_stats = import_repository_to_workspace(
                    project=project,
                    repository=linked_repo,
                    actor=self.request.user,
                    overwrite=True,
                    clear_workspace=True,
                )
                notify(
                    project, self.request.user, 'commit_pushed',
                    f'{self.request.user.get_full_name()} initialized the IDE from repository "{linked_repo.title}" '
                    f'({sync_stats["imported_files"]} files)',
                )
            else:
                # Ensure a new collaboration project can be versioned immediately.
                sync_workspace_to_repository(
                    project=project,
                    actor=self.request.user,
                    title=project.name,
                    description=project.description,
                    allow_empty=True,
                )


class ProjectDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CollabProjectSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        member_ids = ProjectMember.objects.filter(user=user).values_list('project_id', flat=True)
        return CollabProject.objects.filter(
            **{'id__in': list(member_ids)}
        ).union(
            CollabProject.objects.filter(owner=user)
        )

    def update(self, request, *args, **kwargs):
        project = self.get_object()
        if project.owner != request.user:
            return Response({'detail': 'Only the owner can update project details.'}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        project = self.get_object()
        if project.owner != request.user:
            return Response({'detail': 'Only the owner can delete a project.'}, status=403)
        return super().destroy(request, *args, **kwargs)


# ── Members ───────────────────────────────────────────────────────────────────

class MemberListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_project(self, pk):
        try:
            return CollabProject.objects.get(pk=pk)
        except CollabProject.DoesNotExist:
            return None

    def get(self, request, project_pk):
        project = self.get_project(project_pk)
        if not project or not is_member(project, request.user):
            return Response({'detail': 'Not found.'}, status=404)
        serializer = ProjectMemberSerializer(project.members.all(), many=True)
        return Response(serializer.data)

    def post(self, request, project_pk):
        """Invite a user (by email) to the project."""
        project = self.get_project(project_pk)
        if not project:
            return Response({'detail': 'Not found.'}, status=404)
        if project.owner != request.user and get_member_role(project, request.user) != 'owner':
            return Response({'detail': 'Only the owner can invite members.'}, status=403)

        email = request.data.get('email', '').strip()
        role = request.data.get('role', 'viewer')
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({'detail': f'User with email "{email}" not found.'}, status=404)

        member, created = ProjectMember.objects.get_or_create(
            project=project, user=user, defaults={'role': role}
        )
        if not created:
            member.role = role
            member.save()

        notify(
            project, request.user, 'member_added',
            f'{request.user.get_full_name()} added you to "{project.name}"',
        )
        return Response(ProjectMemberSerializer(member).data, status=201 if created else 200)


class MemberDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, project_pk, member_pk):
        try:
            project = CollabProject.objects.get(pk=project_pk)
            member = ProjectMember.objects.get(pk=member_pk, project=project)
        except (CollabProject.DoesNotExist, ProjectMember.DoesNotExist):
            return Response({'detail': 'Not found.'}, status=404)
        if project.owner != request.user and member.user != request.user:
            return Response({'detail': 'Not allowed.'}, status=403)
        member.delete()
        return Response(status=204)


# ── Issues ────────────────────────────────────────────────────────────────────

class IssueListCreateView(generics.ListCreateAPIView):
    serializer_class = IssueSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_project(self):
        return CollabProject.objects.get(pk=self.kwargs['project_pk'])

    def get_queryset(self):
        project = self.get_project()
        if not is_member(project, self.request.user):
            return Issue.objects.none()
        qs = project.issues.all()
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def perform_create(self, serializer):
        project = self.get_project()
        if not can_write(project, self.request.user):
            raise permissions.PermissionDenied('Contributors and owners can create issues.')
        issue = serializer.save(project=project, author=self.request.user)
        notify(
            project, self.request.user, 'issue_opened',
            f'{self.request.user.get_full_name()} opened issue #{issue.number}: {issue.title}',
            object_id=issue.number,
        )


class IssueDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = IssueSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        project = CollabProject.objects.get(pk=self.kwargs['project_pk'])
        return Issue.objects.get(project=project, number=self.kwargs['issue_number'])

    def update(self, request, *args, **kwargs):
        issue = self.get_object()
        project = issue.project
        if not can_write(project, request.user) and issue.author != request.user:
            return Response({'detail': 'Not allowed.'}, status=403)

        # Auto-set closed_at
        new_status = request.data.get('status')
        if new_status == 'closed' and issue.status != 'closed':
            issue.closed_at = timezone.now()
            issue.save(update_fields=['closed_at'])
            notify(
                project, request.user, 'issue_closed',
                f'{request.user.get_full_name()} closed issue #{issue.number}: {issue.title}',
                object_id=issue.number,
            )
        return super().update(request, *args, **kwargs)


class IssueCommentListCreateView(generics.ListCreateAPIView):
    serializer_class = IssueCommentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_issue(self):
        project = CollabProject.objects.get(pk=self.kwargs['project_pk'])
        return Issue.objects.get(project=project, number=self.kwargs['issue_number'])

    def get_queryset(self):
        return self.get_issue().comments.all()

    def perform_create(self, serializer):
        issue = self.get_issue()
        if not is_member(issue.project, self.request.user):
            raise permissions.PermissionDenied()
        comment = serializer.save(issue=issue, author=self.request.user)
        notify(
            issue.project, self.request.user, 'issue_comment',
            f'{self.request.user.get_full_name()} commented on issue #{issue.number}',
            object_id=issue.number,
        )
        return comment


# ── Merge Requests ────────────────────────────────────────────────────────────

class MRListCreateView(generics.ListCreateAPIView):
    serializer_class = MergeRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_project(self):
        return CollabProject.objects.get(pk=self.kwargs['project_pk'])

    def get_queryset(self):
        project = self.get_project()
        if not is_member(project, self.request.user):
            return MergeRequest.objects.none()
        qs = project.merge_requests.all()
        s = self.request.query_params.get('status')
        if s:
            qs = qs.filter(status=s)
        return qs

    def perform_create(self, serializer):
        project = self.get_project()
        if not can_write(project, self.request.user):
            raise permissions.PermissionDenied('Contributors and owners can open MRs.')
        mr = serializer.save(project=project, author=self.request.user)
        notify(
            project, self.request.user, 'mr_opened',
            f'{self.request.user.get_full_name()} opened MR #{mr.number}: {mr.title}',
            object_id=mr.number,
        )


class MRDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MergeRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        project = CollabProject.objects.get(pk=self.kwargs['project_pk'])
        return MergeRequest.objects.get(project=project, number=self.kwargs['mr_number'])

    def update(self, request, *args, **kwargs):
        mr = self.get_object()
        project = mr.project
        if not can_write(project, request.user) and mr.author != request.user:
            return Response({'detail': 'Not allowed.'}, status=403)

        new_status = request.data.get('status')
        if new_status == 'merged' and mr.status == 'open':
            mr.merged_at = timezone.now()
            mr.save(update_fields=['merged_at'])
            # Auto-create a commit record
            sha = hashlib.sha1(f'{mr.pk}{time.time()}'.encode()).hexdigest()
            Commit.objects.create(
                project=project,
                author=request.user,
                message=f'Merge MR #{mr.number}: {mr.title}',
                merge_request=mr,
                sha=sha,
            )
            notify(
                project, request.user, 'mr_merged',
                f'{request.user.get_full_name()} merged MR #{mr.number}: {mr.title}',
                object_id=mr.number,
            )
        elif new_status == 'closed' and mr.status == 'open':
            notify(
                project, request.user, 'mr_closed',
                f'{request.user.get_full_name()} closed MR #{mr.number}: {mr.title}',
                object_id=mr.number,
            )
        return super().update(request, *args, **kwargs)


class MRCommentListCreateView(generics.ListCreateAPIView):
    serializer_class = MRCommentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_mr(self):
        project = CollabProject.objects.get(pk=self.kwargs['project_pk'])
        return MergeRequest.objects.get(project=project, number=self.kwargs['mr_number'])

    def get_queryset(self):
        return self.get_mr().comments.all()

    def perform_create(self, serializer):
        mr = self.get_mr()
        if not is_member(mr.project, self.request.user):
            raise permissions.PermissionDenied()
        comment = serializer.save(merge_request=mr, author=self.request.user)
        notify(
            mr.project, self.request.user, 'mr_comment',
            f'{self.request.user.get_full_name()} reviewed MR #{mr.number}',
            object_id=mr.number,
        )
        return comment


# ── Commits ───────────────────────────────────────────────────────────────────

class CommitListCreateView(generics.ListCreateAPIView):
    serializer_class = CommitSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_project(self):
        return CollabProject.objects.get(pk=self.kwargs['project_pk'])

    def get_queryset(self):
        project = self.get_project()
        if not is_member(project, self.request.user):
            return Commit.objects.none()
        return project.commits.all()

    def perform_create(self, serializer):
        project = self.get_project()
        if not can_write(project, self.request.user):
            raise permissions.PermissionDenied()
        with transaction.atomic():
            commit = serializer.save(project=project, author=self.request.user)
            sync_workspace_to_repository(
                project=project,
                actor=self.request.user,
                title=None,
                description=None,
                allow_empty=False,
                change_notes=commit.message,
            )
            notify(
                project, self.request.user, 'commit_pushed',
                f'{self.request.user.get_full_name()} pushed commit: {commit.message}',
            )


# ── Notifications ─────────────────────────────────────────────────────────────

class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user).order_by('-created_at')[:50]


class MarkNotificationsReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        ids = request.data.get('ids', [])
        if ids:
            Notification.objects.filter(recipient=request.user, id__in=ids).update(is_read=True)
        else:
            Notification.objects.filter(recipient=request.user).update(is_read=True)
        return Response({'detail': 'Marked as read.'})


# ── User search (for inviting members) ───────────────────────────────────────

class UserSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        q = request.query_params.get('q', '').strip()
        if len(q) < 2:
            return Response([])
        from .serializers import UserMiniSerializer
        users = User.objects.filter(
            email__icontains=q
        ).exclude(id=request.user.id)[:10]
        return Response(UserMiniSerializer(users, many=True).data)


# ── IDE File management ──────────────────────────────────────────────────────

class IDEFileListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_project(self, pk):
        try:
            return CollabProject.objects.get(pk=pk)
        except CollabProject.DoesNotExist:
            return None

    def get(self, request, project_pk):
        project = self._get_project(project_pk)
        if not project or not is_member(project, request.user):
            return Response({'detail': 'Not found.'}, status=404)
        files = project.ide_files.all()
        # Don't include content in list (performance)
        serializer = CollabProjectFileSerializer(files, many=True)
        data = [{k: v for k, v in f.items() if k != 'content'} for f in serializer.data]
        return Response(data)

    def post(self, request, project_pk):
        project = self._get_project(project_pk)
        if not project:
            return Response({'detail': 'Not found.'}, status=404)
        if not can_write(project, request.user):
            return Response({'detail': 'Write access required.'}, status=403)
        serializer = CollabProjectFileSerializer(data=request.data)
        if serializer.is_valid():
            f = serializer.save(
                project=project,
                created_by=request.user,
                last_edited_by=request.user,
            )
            notify(
                project, request.user, 'commit_pushed',
                f'{request.user.get_full_name()} created file: {f.path}',
            )
            return Response(CollabProjectFileSerializer(f).data, status=201)
        return Response(serializer.errors, status=400)


class IDEFileDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_objects(self, project_pk, file_pk):
        try:
            project = CollabProject.objects.get(pk=project_pk)
            f = CollabProjectFile.objects.get(pk=file_pk, project=project)
            return project, f
        except (CollabProject.DoesNotExist, CollabProjectFile.DoesNotExist):
            return None, None

    def get(self, request, project_pk, file_pk):
        project, f = self._get_objects(project_pk, file_pk)
        if not f or not is_member(project, request.user):
            return Response({'detail': 'Not found.'}, status=404)
        return Response(CollabProjectFileSerializer(f).data)

    def patch(self, request, project_pk, file_pk):
        project, f = self._get_objects(project_pk, file_pk)
        if not f:
            return Response({'detail': 'Not found.'}, status=404)
        if not can_write(project, request.user):
            return Response({'detail': 'Write access required.'}, status=403)
        serializer = CollabProjectFileSerializer(f, data=request.data, partial=True)
        if serializer.is_valid():
            updated = serializer.save(last_edited_by=request.user)
            return Response(CollabProjectFileSerializer(updated).data)
        return Response(serializer.errors, status=400)

    def delete(self, request, project_pk, file_pk):
        project, f = self._get_objects(project_pk, file_pk)
        if not f:
            return Response({'detail': 'Not found.'}, status=404)
        if not can_write(project, request.user):
            return Response({'detail': 'Write access required.'}, status=403)
        path = f.path
        f.delete()
        notify(
            project, request.user, 'commit_pushed',
            f'{request.user.get_full_name()} deleted file: {path}',
        )
        return Response(status=204)


class IDEPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, project_pk):
        try:
            project = CollabProject.objects.get(pk=project_pk)
        except CollabProject.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        if not is_member(project, request.user):
            return Response({'detail': 'Not found.'}, status=404)

        workspace = build_workspace_map(project)
        if not workspace:
            return Response({'detail': 'No IDE files available.'}, status=400)

        entry_path = resolve_workspace_entry(
            workspace,
            request.query_params.get('entry_file', '').strip(),
            ['index.html', 'main.html', 'app.html'],
        )
        if not entry_path:
            return Response(
                {'detail': 'No HTML entry file found. Add index.html to preview a web app.'},
                status=400,
            )

        return Response({
            'entry_file': entry_path,
            'html': inline_workspace_html(workspace, entry_path),
        })


class IDERunView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, project_pk):
        try:
            project = CollabProject.objects.get(pk=project_pk)
        except CollabProject.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        if not is_member(project, request.user):
            return Response({'detail': 'Not found.'}, status=404)

        workspace = build_workspace_map(project)
        if not workspace:
            return Response({'detail': 'No IDE files available.'}, status=400)

        entry_file = resolve_workspace_entry(
            workspace,
            (request.data.get('entry_file') or '').strip(),
            ['main.py', 'app.py', 'run.py'],
        )
        if not entry_file:
            return Response(
                {'detail': 'No Python entry file found. Add main.py or choose a Python file to run.'},
                status=400,
            )
        if not entry_file.lower().endswith('.py'):
            return Response(
                {'detail': 'Execution currently supports Python files. Use preview for HTML/CSS/JS apps.'},
                status=400,
            )

        stdin_input = request.data.get('stdin_input', request.data.get('stdin', ''))
        if stdin_input is None:
            stdin_input = ''
        if not isinstance(stdin_input, str):
            stdin_input = str(stdin_input)

        # Allow IDE to run the unsaved editor buffer so users can test input-driven
        # scripts immediately without saving first.
        source_code = request.data.get('source_code')
        if not isinstance(source_code, str) or not source_code.strip():
            source_code = workspace[entry_file]

        result = execute_code('python', source_code, stdin_input)
        result['entry_file'] = entry_file
        return Response(result)


# ── Project-linked repositories ─────────────────────────────────────────────

class ProjectLinkedReposView(APIView):
    """List repositories the project owner also owns, for importing into IDE."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, project_pk):
        try:
            project = CollabProject.objects.get(pk=project_pk)
        except CollabProject.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        if not is_member(project, request.user):
            return Response({'detail': 'Not found.'}, status=404)

        from repository.models import Repository
        repos = Repository.objects.filter(
            created_by=project.owner, is_deleted=False
        ).order_by('-updated_at')[:50]
        # Minimal response
        data = [
            {
                'id': r.id,
                'title': r.title,
                'current_version': r.current_version,
                'updated_at': r.updated_at,
                'is_linked': project.linked_repository_id == r.id,
            }
            for r in repos
        ]
        return Response(data)


class ProjectLinkRepositoryView(APIView):
    """
    POST /collab/projects/<uuid>/link-repository/
    Link a collaboration project to an existing repository and optionally
    import its latest version into the IDE workspace.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, project_pk):
        try:
            project = CollabProject.objects.get(pk=project_pk)
        except CollabProject.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        if not is_member(project, request.user):
            return Response({'detail': 'Not found.'}, status=404)

        if not can_write(project, request.user):
            return Response({'detail': 'Write access required.'}, status=403)

        from repository.models import Repository

        repository_id = request.data.get('repository_id')
        repo = None
        if repository_id:
            try:
                repo = Repository.objects.get(pk=repository_id, is_deleted=False)
            except Repository.DoesNotExist:
                return Response({'detail': 'Repository not found.'}, status=404)
        else:
            repo = project.linked_repository
            if not repo:
                return Response({'detail': 'Provide repository_id to link a repository.'}, status=400)

        ensure_linkable_repository(project, repo, request.user)

        import_files = _to_bool(request.data.get('import_files'), True)
        overwrite = _to_bool(request.data.get('overwrite'), True)
        clear_workspace = _to_bool(request.data.get('clear_workspace'), True)

        project.linked_repository = repo
        project.save(update_fields=['linked_repository'])

        sync_stats = {
            'imported_files': 0,
            'created_files': 0,
            'updated_files': 0,
            'deleted_files': 0,
            'skipped_files': 0,
            'truncated': False,
        }
        if import_files:
            sync_stats = import_repository_to_workspace(
                project=project,
                repository=repo,
                actor=request.user,
                overwrite=overwrite,
                clear_workspace=clear_workspace,
            )

        notify(
            project, request.user, 'commit_pushed',
            f'{request.user.get_full_name()} linked repository "{repo.title}" to this collaboration project',
        )

        return Response({
            'repository_id': repo.id,
            'title': repo.title,
            'current_version': repo.current_version,
            **sync_stats,
        }, status=200)


# ── Publish IDE workspace → Repository ───────────────────────────────────────

class PublishToRepositoryView(APIView):
    """
    POST /collab/projects/<uuid>/publish-to-repo/

    Collects all CollabProjectFile records, zips them in memory,
    then either:
      - Creates a new Repository + RepositoryFile (first publish), or
      - Appends a new version to the existing linked Repository.

    Body (JSON):
        {
            "title":       "My Research Code",   # required on first publish
            "description": "Optional summary"     # optional
        }

    Response:
        {
            "repository_id": 42,
            "version":        2,
            "file_count":     7,
            "title":          "My Research Code"
        }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, project_pk):
        # ── Fetch project ───────────────────────────────────────────────────
        try:
            project = CollabProject.objects.get(pk=project_pk)
        except CollabProject.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        if not is_member(project, request.user):
            return Response({'detail': 'Not found.'}, status=404)

        if not can_write(project, request.user):
            return Response({'detail': 'Write access required.'}, status=403)

        title_input = (request.data.get('title') or '').strip()
        desc_supplied = 'description' in request.data
        description = (request.data.get('description') or '').strip() if desc_supplied else None

        # Preserve existing linked repository metadata unless explicitly provided.
        if project.linked_repository:
            title = title_input or None
        else:
            title = title_input or project.name

        repo, current_version, file_count = sync_workspace_to_repository(
            project=project,
            actor=request.user,
            title=title,
            description=description,
            allow_empty=False,
        )
        if not repo:
            return Response({'detail': 'No files in IDE workspace to publish.'}, status=400)

        # Notify project members
        notify(
            project, request.user, 'commit_pushed',
            f'{request.user.get_full_name()} published the workspace to repository "{repo.title}"',
        )

        return Response({
            'repository_id': repo.id,
            'version': current_version,
            'file_count': file_count,
            'title': repo.title,
        }, status=201 if current_version == 1 else 200)
