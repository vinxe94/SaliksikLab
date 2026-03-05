"""
Collaboration views — Git/GitHub-inspired research collaboration.
"""
import hashlib, time
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    CollabProject, ProjectMember, Issue, IssueComment,
    MergeRequest, MRComment, Commit, Notification,
)
from .serializers import (
    CollabProjectSerializer, ProjectMemberSerializer,
    IssueSerializer, IssueCommentSerializer,
    MergeRequestSerializer, MRCommentSerializer,
    CommitSerializer, NotificationSerializer,
)

User = get_user_model()


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
        project = serializer.save(owner=self.request.user)
        # Auto-add owner as member
        ProjectMember.objects.get_or_create(
            project=project,
            user=self.request.user,
            defaults={'role': 'owner'}
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
        commit = serializer.save(project=project, author=self.request.user)
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
