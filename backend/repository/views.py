import os
from .runner import run_repository_file, list_runnable_files, RunnerError
import base64
import binascii
import csv
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.core.files.base import ContentFile
from django.core.mail import send_mail
from django.conf import settings as django_settings
from django.db.models import Q, Count
from django.utils import timezone
from rest_framework import generics, permissions, status, filters
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
import json

from .models import (
    ResearchOutput, OutputFile, DownloadLog,
    Repository, RepositoryFile, ArchiveDocument, ArchiveDocumentVersion,
    Department, Course,
)
from .serializers import (
    ResearchOutputListSerializer,
    ResearchOutputDetailSerializer,
    ResearchOutputCreateSerializer,
    OutputFileSerializer,
    RevisionSerializer,
    RepositoryListSerializer,
    RepositoryDetailSerializer,
    RepositoryCreateSerializer,
    RepositoryUpdateSerializer,
    RepositoryRevisionSerializer,
    RepositoryFileSerializer,
    ArchiveDocumentListSerializer,
    ArchiveDocumentDetailSerializer,
    ArchiveDocumentCreateSerializer,
    ArchiveDocumentUpdateSerializer,
    ArchiveDocumentCompactSerializer,
    ArchiveDocumentReviewSerializer,
    ArchiveDocumentRevisionSerializer,
    ArchiveDocumentVersionSerializer,
    DepartmentSerializer,
    CourseSerializer,
)
from .file_browser import browse_file, read_file_content, get_file_type, MAX_PREVIEW_SIZE


class IsAdminUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'


class IsOwnerOrAdmin(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.uploaded_by == request.user or request.user.role == 'admin'


class IsRepositoryOwnerOrAdmin(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.created_by == request.user or request.user.role == 'admin'


class IsArchiveOwnerOrAdmin(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.uploaded_by == request.user or request.user.role == 'admin'


def user_can_access_repository(user, repository):
    return (
        user.is_authenticated and (
            user.role == 'admin' or
            repository.is_public or
            repository.created_by == user
        )
    )


def user_can_access_archive(user, doc):
    return (
        user.is_authenticated and (
            user.role == 'admin' or
            doc.is_public or
            doc.uploaded_by == user or
            doc.assigned_faculty == user
        )
    )


def user_can_review_archive(user, doc):
    return (
        user.is_authenticated and
        user.role == 'faculty' and
        doc.assigned_faculty == user
    )


def user_email(user):
    return user.email if user else None


def find_backup_user(email, fallback_user):
    if not email:
        return fallback_user
    from django.contrib.auth import get_user_model
    User = get_user_model()
    return User.objects.filter(email=email).first() or fallback_user


def file_backup_payload(file_field, original_filename=''):
    if not file_field:
        return None
    payload = {
        'path': file_field.name,
        'name': original_filename or os.path.basename(file_field.name),
        'content_base64': '',
    }
    try:
        if file_field.name and os.path.exists(file_field.path):
            with open(file_field.path, 'rb') as source:
                payload['content_base64'] = base64.b64encode(source.read()).decode('ascii')
    except (OSError, ValueError):
        payload['content_base64'] = ''
    return payload


def restore_file_field(instance, field_name, payload):
    if not payload:
        return
    file_field = getattr(instance, field_name)
    filename = payload.get('name') or os.path.basename(payload.get('path', 'restored-file'))
    content = payload.get('content_base64') or ''
    if content:
        try:
            file_field.save(filename, ContentFile(base64.b64decode(content)), save=False)
            return
        except (binascii.Error, ValueError):
            pass
    if payload.get('path'):
        setattr(instance, field_name, payload['path'])


class ResearchOutputListCreateView(generics.ListCreateAPIView):
    parser_classes = [MultiPartParser, FormParser]

    def get_permissions(self):
        if self.request.method == 'GET':
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated()]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ResearchOutputCreateSerializer
        return ResearchOutputListSerializer

    def get_queryset(self):
        qs = ResearchOutput.objects.filter(is_deleted=False)

        # Non-admins only see approved outputs (plus their own)
        user = self.request.user
        if user.role != 'admin':
            qs = qs.filter(Q(is_approved=True) | Q(uploaded_by=user))

        # My Submissions filter
        if self.request.query_params.get('mine') == 'true':
            qs = qs.filter(uploaded_by=user)

        # Search
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(title__icontains=search) |
                Q(author__icontains=search) |
                Q(abstract__icontains=search) |
                Q(keywords__icontains=search)
            )

        # Filters
        year = self.request.query_params.get('year')
        if year:
            qs = qs.filter(year=year)

        dept = self.request.query_params.get('department')
        if dept:
            qs = qs.filter(department__icontains=dept)

        output_type = self.request.query_params.get('type')
        if output_type:
            qs = qs.filter(output_type=output_type)

        adviser = self.request.query_params.get('adviser')
        if adviser:
            qs = qs.filter(adviser__icontains=adviser)

        course = self.request.query_params.get('course')
        if course:
            qs = qs.filter(course__icontains=course)

        return qs

    def perform_create(self, serializer):
        serializer.save()


class ResearchOutputDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ResearchOutputDetailSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]

    def get_queryset(self):
        return ResearchOutput.objects.filter(is_deleted=False)

    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return ResearchOutputDetailSerializer
        return ResearchOutputDetailSerializer

    def destroy(self, request, *args, **kwargs):
        """Soft delete."""
        instance = self.get_object()
        if request.user.role != 'admin' and instance.uploaded_by != request.user:
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        instance.is_deleted = True
        instance.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ApproveOutputView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        output = get_object_or_404(ResearchOutput, pk=pk, is_deleted=False)
        action = request.data.get('action', 'approve')  # 'approve' or 'reject'
        rejection_reason = request.data.get('rejection_reason', '').strip()

        if action == 'reject':
            if not rejection_reason:
                return Response(
                    {'rejection_reason': 'A rejection reason is required.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            output.is_approved = False
            output.is_rejected = True
            output.rejection_reason = rejection_reason
            output.save()
            # Email notification
            if output.uploaded_by and output.uploaded_by.email:
                try:
                    send_mail(
                        subject=f'Your submission "{output.title}" was not approved',
                        message=(
                            f'Hi {output.uploaded_by.get_full_name()},\n\n'
                            f'Your submission "{output.title}" has been reviewed and was not approved.\n\n'
                            f'Reason: {rejection_reason}\n\n'
                            f'Please revise and resubmit if needed.'
                        ),
                        from_email=django_settings.DEFAULT_FROM_EMAIL,
                        recipient_list=[output.uploaded_by.email],
                        fail_silently=True,
                    )
                except Exception:
                    pass
            return Response({
                'is_approved': output.is_approved,
                'is_rejected': output.is_rejected,
                'rejection_reason': output.rejection_reason,
            })
        else:  # approve
            output.is_approved = True
            output.is_rejected = False
            output.rejection_reason = ''
            output.save()
            # Email notification
            if output.uploaded_by and output.uploaded_by.email:
                try:
                    send_mail(
                        subject=f'Your submission "{output.title}" has been approved!',
                        message=(
                            f'Hi {output.uploaded_by.get_full_name()},\n\n'
                            f'Great news! Your submission "{output.title}" has been approved '
                            f'and is now visible in the research repository.'
                        ),
                        from_email=django_settings.DEFAULT_FROM_EMAIL,
                        recipient_list=[output.uploaded_by.email],
                        fail_silently=True,
                    )
                except Exception:
                    pass
            return Response({
                'is_approved': output.is_approved,
                'is_rejected': output.is_rejected,
                'rejection_reason': output.rejection_reason,
            })


class DownloadFileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk, file_id=None):
        output = get_object_or_404(ResearchOutput, pk=pk, is_deleted=False)
        user = request.user
        if not output.is_approved and output.uploaded_by != user and user.role != 'admin':
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)

        if file_id:
            output_file = get_object_or_404(OutputFile, pk=file_id, research_output=output)
        else:
            output_file = output.files.order_by('-version').first()
            if not output_file:
                raise Http404('No files found.')

        if not os.path.exists(output_file.file.path):
            raise Http404('File not found on server.')

        # Log the download
        DownloadLog.objects.create(
            user=user,
            research_output=output,
            output_file=output_file,
        )

        response = FileResponse(
            open(output_file.file.path, 'rb'),
            as_attachment=True,
            filename=output_file.original_filename,
        )
        return response


class PreviewFileView(APIView):
    """Serve a file inline for in-browser reading/viewing."""
    permission_classes = []  # We handle auth manually to support query-param tokens
    authentication_classes = []

    CONTENT_TYPES = {
        'pdf': 'application/pdf',
        'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
        'gif': 'image/gif', 'svg': 'image/svg+xml', 'webp': 'image/webp',
        'txt': 'text/plain', 'md': 'text/plain', 'csv': 'text/plain',
        'py': 'text/plain', 'js': 'text/plain', 'ts': 'text/plain',
        'java': 'text/plain', 'c': 'text/plain', 'cpp': 'text/plain',
        'h': 'text/plain', 'cs': 'text/plain', 'php': 'text/plain',
        'rb': 'text/plain', 'html': 'text/html', 'css': 'text/plain',
        'json': 'application/json', 'xml': 'text/xml',
        'yaml': 'text/plain', 'yml': 'text/plain',
    }

    def _get_user(self, request):
        """Authenticate via Authorization header or ?token= query param."""
        from rest_framework_simplejwt.tokens import AccessToken
        from django.contrib.auth import get_user_model
        User = get_user_model()

        # Try Authorization header first
        auth = request.META.get('HTTP_AUTHORIZATION', '')
        if auth.startswith('Bearer '):
            token_str = auth[7:]
        else:
            token_str = request.query_params.get('token', '')

        if not token_str:
            return None
        try:
            token = AccessToken(token_str)
            return User.objects.get(id=token['user_id'])
        except Exception:
            return None

    def get(self, request, pk, file_id=None):
        user = self._get_user(request)
        if not user:
            return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

        output = get_object_or_404(ResearchOutput, pk=pk, is_deleted=False)
        if not output.is_approved and output.uploaded_by != user and user.role != 'admin':
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)

        if file_id:
            output_file = get_object_or_404(OutputFile, pk=file_id, research_output=output)
        else:
            output_file = output.files.order_by('-version').first()
            if not output_file:
                raise Http404('No files found.')

        if not os.path.exists(output_file.file.path):
            raise Http404('File not found on server.')

        ext = output_file.original_filename.rsplit('.', 1)[-1].lower() if '.' in output_file.original_filename else ''
        content_type = self.CONTENT_TYPES.get(ext, 'application/octet-stream')

        response = FileResponse(
            open(output_file.file.path, 'rb'),
            content_type=content_type,
        )
        response['Content-Disposition'] = f'inline; filename="{output_file.original_filename}"'
        return response


class ReviseOutputView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        output = get_object_or_404(ResearchOutput, pk=pk, is_deleted=False)
        self.check_object_permissions(request, output)

        serializer = RevisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        latest = output.files.order_by('-version').first()
        new_version = (latest.version + 1) if latest else 1

        OutputFile.objects.create(
            research_output=output,
            file=serializer.validated_data['file'],
            original_filename=serializer.validated_data['file'].name,
            file_size=serializer.validated_data['file'].size,
            version=new_version,
            change_notes=serializer.validated_data.get('change_notes', ''),
            uploaded_by=request.user,
        )

        # Update optional metadata fields if provided
        metadata_fields = [
            'title', 'abstract', 'author', 'adviser', 'department', 'course',
        ]
        for field in metadata_fields:
            value = serializer.validated_data.get(field)
            if value is not None and value != '':
                setattr(output, field, value)

        if 'keywords' in serializer.validated_data:
            output.keywords = serializer.validated_data['keywords']
        if 'co_authors' in serializer.validated_data:
            output.co_authors = serializer.validated_data['co_authors']

        # Reset approval status — revision requires re-review
        output.is_approved = False
        output.is_rejected = False
        output.rejection_reason = ''
        output.save()

        # Notify admin users by email
        from django.contrib.auth import get_user_model
        User = get_user_model()
        admin_emails = list(
            User.objects.filter(role='admin', is_active=True)
            .exclude(email='')
            .values_list('email', flat=True)
        )
        if admin_emails:
            try:
                send_mail(
                    subject=f'Revision submitted: "{output.title}" (v{new_version})',
                    message=(
                        f'{request.user.get_full_name()} submitted a revision '
                        f'(version {new_version}) for "{output.title}".\n\n'
                        f'Change notes: {serializer.validated_data.get("change_notes", "—")}\n\n'
                        f'Please review the updated submission.'
                    ),
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=admin_emails,
                    fail_silently=True,
                )
            except Exception:
                pass

        return Response({'version': new_version}, status=status.HTTP_201_CREATED)


class VersionHistoryView(generics.ListAPIView):
    serializer_class = OutputFileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return OutputFile.objects.filter(
            research_output__pk=self.kwargs['pk'],
            research_output__is_deleted=False
        ).order_by('-version')


class RollbackVersionView(APIView):
    """Admin-only: delete all versions newer than the specified version."""
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        output = get_object_or_404(ResearchOutput, pk=pk, is_deleted=False)
        target_version = request.data.get('version')

        if target_version is None:
            return Response(
                {'detail': 'version is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            target_version = int(target_version)
        except (ValueError, TypeError):
            return Response(
                {'detail': 'version must be a number.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_file = output.files.filter(version=target_version).first()
        if not target_file:
            return Response(
                {'detail': f'Version {target_version} not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Delete all versions newer than the target
        newer = output.files.filter(version__gt=target_version)
        for f in newer:
            if f.file and os.path.exists(f.file.path):
                try:
                    os.remove(f.file.path)
                except OSError:
                    pass
            f.delete()

        output.save()  # update updated_at
        return Response(
            {'detail': f'Rolled back to version {target_version}.', 'version': target_version},
            status=status.HTTP_200_OK,
        )


class BackupView(APIView):
    """Admin-only self-contained JSON backup of repository data and uploaded files."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        departments = Department.objects.all().order_by('id')
        courses = Course.objects.select_related('department').all().order_by('id')
        repositories = Repository.objects.select_related('created_by').all().order_by('id')
        repository_files = RepositoryFile.objects.select_related('repository', 'uploaded_by').all().order_by('id')
        archives = ArchiveDocument.objects.select_related(
            'uploaded_by', 'linked_repository', 'assigned_faculty', 'reviewed_by',
        ).all().order_by('id')
        archive_versions = ArchiveDocumentVersion.objects.select_related(
            'archive_document', 'uploaded_by',
        ).all().order_by('id')
        outputs = ResearchOutput.objects.select_related('uploaded_by').all().order_by('id')
        output_files = OutputFile.objects.select_related('research_output', 'uploaded_by').all().order_by('id')

        data = {
            'schema_version': 2,
            'generated_at': timezone.now().isoformat(),
            'counts': {
                'departments': departments.count(),
                'courses': courses.count(),
                'repositories': repositories.count(),
                'repository_files': repository_files.count(),
                'archives': archives.count(),
                'archive_versions': archive_versions.count(),
                'research_outputs': outputs.count(),
                'output_files': output_files.count(),
            },
            'data': {
                'departments': [
                    {
                        'id': item.id,
                        'name': item.name,
                        'is_active': item.is_active,
                    }
                    for item in departments
                ],
                'courses': [
                    {
                        'id': item.id,
                        'name': item.name,
                        'department_id': item.department_id,
                        'department_name': item.department.name if item.department else '',
                        'is_active': item.is_active,
                    }
                    for item in courses
                ],
                'repositories': [
                    {
                        'id': item.id,
                        'title': item.title,
                        'description': item.description,
                        'created_by_email': user_email(item.created_by),
                        'is_public': item.is_public,
                        'is_deleted': item.is_deleted,
                    }
                    for item in repositories
                ],
                'repository_files': [
                    {
                        'id': item.id,
                        'repository_id': item.repository_id,
                        'original_filename': item.original_filename,
                        'file_size': item.file_size,
                        'version': item.version,
                        'change_notes': item.change_notes,
                        'uploaded_by_email': user_email(item.uploaded_by),
                        'file': file_backup_payload(item.file, item.original_filename),
                    }
                    for item in repository_files
                ],
                'archives': [
                    {
                        'id': item.id,
                        'title': item.title,
                        'abstract': item.abstract,
                        'original_filename': item.original_filename,
                        'file_size': item.file_size,
                        'author': item.author,
                        'department': item.department,
                        'course': item.course,
                        'year': item.year,
                        'uploaded_by_email': user_email(item.uploaded_by),
                        'linked_repository_id': item.linked_repository_id,
                        'system_link': item.system_link,
                        'assigned_faculty_email': user_email(item.assigned_faculty),
                        'is_public': item.is_public,
                        'is_approved': item.is_approved,
                        'is_rejected': item.is_rejected,
                        'rejection_reason': item.rejection_reason,
                        'revision_comment': item.revision_comment,
                        'reviewed_by_email': user_email(item.reviewed_by),
                        'is_deleted': item.is_deleted,
                        'file': file_backup_payload(item.file, item.original_filename),
                    }
                    for item in archives
                ],
                'archive_versions': [
                    {
                        'id': item.id,
                        'archive_document_id': item.archive_document_id,
                        'original_filename': item.original_filename,
                        'file_size': item.file_size,
                        'version': item.version,
                        'change_notes': item.change_notes,
                        'uploaded_by_email': user_email(item.uploaded_by),
                        'file': file_backup_payload(item.file, item.original_filename),
                    }
                    for item in archive_versions
                ],
                'research_outputs': [
                    {
                        'id': item.id,
                        'title': item.title,
                        'abstract': item.abstract,
                        'output_type': item.output_type,
                        'department': item.department,
                        'year': item.year,
                        'keywords': item.keywords,
                        'author': item.author,
                        'adviser': item.adviser,
                        'uploaded_by_email': user_email(item.uploaded_by),
                        'is_approved': item.is_approved,
                        'is_rejected': item.is_rejected,
                        'rejection_reason': item.rejection_reason,
                        'is_deleted': item.is_deleted,
                        'course': item.course,
                        'co_authors': item.co_authors,
                    }
                    for item in outputs
                ],
                'output_files': [
                    {
                        'id': item.id,
                        'research_output_id': item.research_output_id,
                        'original_filename': item.original_filename,
                        'file_size': item.file_size,
                        'version': item.version,
                        'change_notes': item.change_notes,
                        'uploaded_by_email': user_email(item.uploaded_by),
                        'file': file_backup_payload(item.file, item.original_filename),
                    }
                    for item in output_files
                ],
            },
        }
        return Response(data)


class RestoreView(APIView):
    """Admin-only restore from a JSON backup generated by BackupView."""
    permission_classes = [IsAdminUser]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def post(self, request):
        backup_file = request.FILES.get('backup_file')
        if backup_file:
            try:
                payload = json.loads(backup_file.read().decode('utf-8'))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return Response({'detail': 'Invalid backup JSON file.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            payload = request.data

        data = payload.get('data', payload)
        restored = {
            'departments': 0,
            'courses': 0,
            'repositories': 0,
            'repository_files': 0,
            'archives': 0,
            'archive_versions': 0,
            'research_outputs': 0,
            'output_files': 0,
        }

        for item in data.get('departments', []):
            Department.objects.update_or_create(
                id=item.get('id'),
                defaults={
                    'name': item.get('name', ''),
                    'is_active': item.get('is_active', True),
                },
            )
            restored['departments'] += 1

        for item in data.get('courses', []):
            department = None
            if item.get('department_id'):
                department = Department.objects.filter(id=item.get('department_id')).first()
            if not department and item.get('department_name'):
                department = Department.objects.filter(name=item.get('department_name')).first()
            Course.objects.update_or_create(
                id=item.get('id'),
                defaults={
                    'name': item.get('name', ''),
                    'department': department,
                    'is_active': item.get('is_active', True),
                },
            )
            restored['courses'] += 1

        for item in data.get('repositories', []):
            Repository.objects.update_or_create(
                id=item.get('id'),
                defaults={
                    'title': item.get('title', ''),
                    'description': item.get('description', ''),
                    'created_by': find_backup_user(item.get('created_by_email'), request.user),
                    'is_public': item.get('is_public', True),
                    'is_deleted': item.get('is_deleted', False),
                },
            )
            restored['repositories'] += 1

        for item in data.get('repository_files', []):
            repository = Repository.objects.filter(id=item.get('repository_id')).first()
            if not repository:
                continue
            obj, _ = RepositoryFile.objects.update_or_create(
                id=item.get('id'),
                defaults={
                    'repository': repository,
                    'file': item.get('file', {}).get('path', ''),
                    'original_filename': item.get('original_filename', ''),
                    'file_size': item.get('file_size', 0),
                    'version': item.get('version', 1),
                    'change_notes': item.get('change_notes', ''),
                    'uploaded_by': find_backup_user(item.get('uploaded_by_email'), request.user),
                },
            )
            restore_file_field(obj, 'file', item.get('file'))
            obj.save()
            restored['repository_files'] += 1

        for item in data.get('archives', []):
            linked_repository = None
            if item.get('linked_repository_id'):
                linked_repository = Repository.objects.filter(id=item.get('linked_repository_id')).first()
            obj, _ = ArchiveDocument.objects.update_or_create(
                id=item.get('id'),
                defaults={
                    'title': item.get('title', ''),
                    'abstract': item.get('abstract', ''),
                    'file': item.get('file', {}).get('path', ''),
                    'original_filename': item.get('original_filename', ''),
                    'file_size': item.get('file_size', 0),
                    'author': item.get('author', ''),
                    'department': item.get('department', ''),
                    'course': item.get('course', ''),
                    'year': item.get('year'),
                    'uploaded_by': find_backup_user(item.get('uploaded_by_email'), request.user),
                    'linked_repository': linked_repository,
                    'system_link': item.get('system_link', ''),
                    'assigned_faculty': find_backup_user(item.get('assigned_faculty_email'), request.user),
                    'is_public': item.get('is_public', True),
                    'is_approved': item.get('is_approved', False),
                    'is_rejected': item.get('is_rejected', False),
                    'rejection_reason': item.get('rejection_reason', ''),
                    'revision_comment': item.get('revision_comment', ''),
                    'reviewed_by': find_backup_user(item.get('reviewed_by_email'), request.user) if item.get('reviewed_by_email') else None,
                    'is_deleted': item.get('is_deleted', False),
                },
            )
            restore_file_field(obj, 'file', item.get('file'))
            obj.save()
            restored['archives'] += 1

        for item in data.get('archive_versions', []):
            archive = ArchiveDocument.objects.filter(id=item.get('archive_document_id')).first()
            if not archive:
                continue
            obj, _ = ArchiveDocumentVersion.objects.update_or_create(
                id=item.get('id'),
                defaults={
                    'archive_document': archive,
                    'file': item.get('file', {}).get('path', ''),
                    'original_filename': item.get('original_filename', ''),
                    'file_size': item.get('file_size', 0),
                    'version': item.get('version', 1),
                    'change_notes': item.get('change_notes', ''),
                    'uploaded_by': find_backup_user(item.get('uploaded_by_email'), request.user),
                },
            )
            restore_file_field(obj, 'file', item.get('file'))
            obj.save()
            restored['archive_versions'] += 1

        for item in data.get('research_outputs', []):
            ResearchOutput.objects.update_or_create(
                id=item.get('id'),
                defaults={
                    'title': item.get('title', ''),
                    'abstract': item.get('abstract', ''),
                    'output_type': item.get('output_type', 'thesis'),
                    'department': item.get('department', ''),
                    'year': item.get('year') or timezone.now().year,
                    'keywords': item.get('keywords', []),
                    'author': item.get('author', ''),
                    'adviser': item.get('adviser', ''),
                    'uploaded_by': find_backup_user(item.get('uploaded_by_email'), request.user),
                    'is_approved': item.get('is_approved', False),
                    'is_rejected': item.get('is_rejected', False),
                    'rejection_reason': item.get('rejection_reason', ''),
                    'is_deleted': item.get('is_deleted', False),
                    'course': item.get('course', ''),
                    'co_authors': item.get('co_authors', []),
                },
            )
            restored['research_outputs'] += 1

        for item in data.get('output_files', []):
            output = ResearchOutput.objects.filter(id=item.get('research_output_id')).first()
            if not output:
                continue
            obj, _ = OutputFile.objects.update_or_create(
                id=item.get('id'),
                defaults={
                    'research_output': output,
                    'file': item.get('file', {}).get('path', ''),
                    'original_filename': item.get('original_filename', ''),
                    'file_size': item.get('file_size', 0),
                    'version': item.get('version', 1),
                    'change_notes': item.get('change_notes', ''),
                    'uploaded_by': find_backup_user(item.get('uploaded_by_email'), request.user),
                },
            )
            restore_file_field(obj, 'file', item.get('file'))
            obj.save()
            restored['output_files'] += 1

        return Response({'detail': 'Backup restored.', 'restored': restored}, status=status.HTTP_200_OK)


class StatsView(APIView):
    """Dashboard analytics — open to all authenticated users (filters by role)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        qs = ResearchOutput.objects.filter(is_deleted=False)
        if user.role != 'admin':
            qs = qs.filter(Q(is_approved=True) | Q(uploaded_by=user))

        total = qs.count()
        approved = qs.filter(is_approved=True).count()
        pending = qs.filter(is_approved=False, is_rejected=False).count()
        rejected = qs.filter(is_rejected=True).count()
        my_uploads = qs.filter(uploaded_by=user).count()

        by_type = list(qs.values('output_type').annotate(count=Count('id')).order_by('-count'))
        by_dept = list(qs.filter(is_approved=True).values('department').annotate(count=Count('id')).order_by('-count')[:8])
        by_year = list(qs.filter(is_approved=True).values('year').annotate(count=Count('id')).order_by('year'))

        return Response({
            'total': total,
            'approved': approved,
            'pending': pending,
            'rejected': rejected,
            'my_uploads': my_uploads,
            'by_type': by_type,
            'by_dept': by_dept,
            'by_year': by_year,
        })


class ExportCSVView(APIView):
    """Admin-only CSV export of all research outputs."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        outputs = ResearchOutput.objects.filter(is_deleted=False).select_related('uploaded_by')
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="research_outputs.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'ID', 'Title', 'Type', 'Department', 'Course', 'Year',
            'Author', 'Co-Authors', 'Adviser', 'Keywords',
            'Status', 'Rejected', 'Rejection Reason',
            'Uploaded By', 'Upload Date', 'Downloads',
        ])
        for o in outputs:
            status_str = 'Approved' if o.is_approved else ('Rejected' if o.is_rejected else 'Pending')
            writer.writerow([
                o.id, o.title, o.output_type, o.department, o.course, o.year,
                o.author, ', '.join(o.co_authors), o.adviser,
                ', '.join(o.keywords), status_str, o.is_rejected, o.rejection_reason,
                o.uploaded_by.get_full_name() if o.uploaded_by else '',
                o.created_at.strftime('%Y-%m-%d'),
                o.download_logs.count(),
            ])
        return response


class BrowseFileView(APIView):
    """Browse the file tree of an uploaded file (ZIP/TAR archives or single files)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk, file_id=None):
        output = get_object_or_404(ResearchOutput, pk=pk, is_deleted=False)
        user = request.user
        if not output.is_approved and output.uploaded_by != user and user.role != 'admin':
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)

        if file_id:
            output_file = get_object_or_404(OutputFile, pk=file_id, research_output=output)
        else:
            output_file = output.files.order_by('-version').first()
            if not output_file:
                return Response({'detail': 'No files found.'}, status=status.HTTP_404_NOT_FOUND)

        if not os.path.exists(output_file.file.path):
            return Response({'detail': 'File not found on server.'}, status=status.HTTP_404_NOT_FOUND)

        path = request.query_params.get('path', '')

        try:
            result = browse_file(output_file.file.path, output_file.original_filename, path)
            result['file_id'] = output_file.id
            result['original_filename'] = output_file.original_filename
            result['version'] = output_file.version
            return Response(result)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class FileContentView(APIView):
    """Read the content of a specific file within an uploaded archive."""
    permission_classes = []
    authentication_classes = []

    CONTENT_TYPES = {
        'pdf': 'application/pdf',
        'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
        'gif': 'image/gif', 'svg': 'image/svg+xml', 'webp': 'image/webp',
        'ico': 'image/x-icon', 'bmp': 'image/bmp',
    }

    def _get_user(self, request):
        from rest_framework_simplejwt.tokens import AccessToken
        from django.contrib.auth import get_user_model
        User = get_user_model()
        auth = request.META.get('HTTP_AUTHORIZATION', '')
        if auth.startswith('Bearer '):
            token_str = auth[7:]
        else:
            token_str = request.query_params.get('token', '')
        if not token_str:
            return None
        try:
            token = AccessToken(token_str)
            return User.objects.get(id=token['user_id'])
        except Exception:
            return None

    def get(self, request, pk, file_id=None):
        user = self._get_user(request)
        if not user:
            return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

        output = get_object_or_404(ResearchOutput, pk=pk, is_deleted=False)
        if not output.is_approved and output.uploaded_by != user and user.role != 'admin':
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)

        if file_id:
            output_file = get_object_or_404(OutputFile, pk=file_id, research_output=output)
        else:
            output_file = output.files.order_by('-version').first()
            if not output_file:
                return Response({'detail': 'No files found.'}, status=status.HTTP_404_NOT_FOUND)

        if not os.path.exists(output_file.file.path):
            return Response({'detail': 'File not found on server.'}, status=status.HTTP_404_NOT_FOUND)

        inner_path = request.query_params.get('path', '')

        try:
            data, filename, file_type = read_file_content(
                output_file.file.path, output_file.original_filename, inner_path
            )
        except FileNotFoundError as e:
            return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''

        if file_type == 'text':
            # Return as plain text
            truncated = len(data) > MAX_PREVIEW_SIZE
            text = data[:MAX_PREVIEW_SIZE].decode('utf-8', errors='replace')
            response = HttpResponse(text, content_type='text/plain; charset=utf-8')
            response['Content-Disposition'] = f'inline; filename="{filename}"'
            if truncated:
                response['X-Truncated'] = 'true'
            return response
        elif file_type in ('image', 'pdf'):
            content_type = self.CONTENT_TYPES.get(ext, 'application/octet-stream')
            response = HttpResponse(data, content_type=content_type)
            response['Content-Disposition'] = f'inline; filename="{filename}"'
            return response
        else:
            # Binary — send as download
            response = HttpResponse(data, content_type='application/octet-stream')
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response


class RunRepositoryFileView(APIView):
    """
    POST /api/repository/<pk>/run/
    POST /api/repository/<pk>/run/<file_id>/

    Execute a runnable file from an uploaded repository through the sandbox.

    Request body (JSON):
        {
            "stdin_input": "...",      // optional
            "entry_file": "src/main.py" // optional override for archive entry
        }

    Response:
        {
            "language": "python",
            "entry_file": "main.py",
            "status": "success" | "error" | "timeout",
            "stdout": "...",
            "stderr": "...",
            "exit_code": 0,
            "execution_time_ms": 123.4
        }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk, file_id=None):
        output = get_object_or_404(ResearchOutput, pk=pk, is_deleted=False)
        user = request.user
        if not output.is_approved and output.uploaded_by != user and user.role != 'admin':
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)

        if file_id:
            output_file = get_object_or_404(OutputFile, pk=file_id, research_output=output)
        else:
            output_file = output.files.order_by('-version').first()
            if not output_file:
                return Response({'detail': 'No files found.'}, status=status.HTTP_404_NOT_FOUND)

        if not os.path.exists(output_file.file.path):
            return Response({'detail': 'File not found on server.'}, status=status.HTTP_404_NOT_FOUND)

        stdin_input  = request.data.get('stdin_input', '')
        entry_override = request.data.get('entry_file', '')

        try:
            result = run_repository_file(
                file_path=output_file.file.path,
                original_filename=output_file.original_filename,
                stdin_input=stdin_input,
                entry_override=entry_override,
            )
        except RunnerError as e:
            return Response({'detail': str(e)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        except Exception as e:
            return Response(
                {'detail': f'Execution error: {e}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(result, status=status.HTTP_200_OK)


class ListRunnableFilesView(APIView):
    """
    GET /api/repository/<pk>/runnable/
    GET /api/repository/<pk>/runnable/<file_id>/

    List all runnable source files found in the uploaded file.
    Returns [] for non-code files (PDF, DOCX, …).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk, file_id=None):
        output = get_object_or_404(ResearchOutput, pk=pk, is_deleted=False)
        user = request.user
        if not output.is_approved and output.uploaded_by != user and user.role != 'admin':
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)

        if file_id:
            output_file = get_object_or_404(OutputFile, pk=file_id, research_output=output)
        else:
            output_file = output.files.order_by('-version').first()
            if not output_file:
                return Response({'detail': 'No files found.'}, status=status.HTTP_404_NOT_FOUND)

        if not os.path.exists(output_file.file.path):
            return Response({'detail': 'File not found on server.'}, status=status.HTTP_404_NOT_FOUND)

        files = list_runnable_files(output_file.file.path, output_file.original_filename)
        return Response({
            'file_id': output_file.id,
            'original_filename': output_file.original_filename,
            'runnable_files': files,
        })


class RepositoryListCreateView(generics.ListCreateAPIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return RepositoryCreateSerializer
        return RepositoryListSerializer

    def get_queryset(self):
        qs = Repository.objects.filter(is_deleted=False).select_related('created_by')
        if self.request.user.role != 'admin':
            qs = qs.filter(Q(is_public=True) | Q(created_by=self.request.user))
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))
        if self.request.query_params.get('mine') == 'true':
            qs = qs.filter(created_by=self.request.user)
        has_documents = self.request.query_params.get('has_documents')
        if has_documents == 'true':
            qs = qs.annotate(linked_docs=Count('archive_documents')).filter(linked_docs__gt=0)
        elif has_documents == 'false':
            qs = qs.annotate(linked_docs=Count('archive_documents')).filter(linked_docs=0)
        return qs


class RepositoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, IsRepositoryOwnerOrAdmin]

    def get_queryset(self):
        qs = Repository.objects.filter(is_deleted=False).select_related('created_by')
        if self.request.user.role != 'admin':
            qs = qs.filter(Q(is_public=True) | Q(created_by=self.request.user))
        return qs

    def get_serializer_class(self):
        if self.request.method in ['PATCH', 'PUT']:
            return RepositoryUpdateSerializer
        return RepositoryDetailSerializer

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_deleted = True
        instance.save(update_fields=['is_deleted'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class RepositoryVersionHistoryView(generics.ListAPIView):
    serializer_class = RepositoryFileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        repository = get_object_or_404(Repository, pk=self.kwargs['pk'], is_deleted=False)
        if not user_can_access_repository(self.request.user, repository):
            return RepositoryFile.objects.none()
        return RepositoryFile.objects.filter(repository=repository)


class RepositoryReviseView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [permissions.IsAuthenticated, IsRepositoryOwnerOrAdmin]

    def post(self, request, pk):
        repository = get_object_or_404(Repository, pk=pk, is_deleted=False)
        self.check_object_permissions(request, repository)
        serializer = RepositoryRevisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        latest = repository.files.order_by('-version').first()
        new_version = (latest.version + 1) if latest else 1

        RepositoryFile.objects.create(
            repository=repository,
            file=serializer.validated_data['file'],
            original_filename=serializer.validated_data['file'].name,
            file_size=serializer.validated_data['file'].size,
            version=new_version,
            change_notes=serializer.validated_data.get('change_notes', ''),
            uploaded_by=request.user,
        )
        repository.save(update_fields=['updated_at'])
        return Response({'version': new_version}, status=status.HTTP_201_CREATED)


class RepositoryRelatedDocumentsView(generics.ListAPIView):
    serializer_class = ArchiveDocumentCompactSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        repository = get_object_or_404(Repository, pk=self.kwargs['pk'], is_deleted=False)
        if not user_can_access_repository(self.request.user, repository):
            return ArchiveDocument.objects.none()
        qs = ArchiveDocument.objects.filter(
            linked_repository__pk=self.kwargs['pk'],
            linked_repository__is_deleted=False,
            is_deleted=False,
        ).select_related('linked_repository')
        if self.request.user.role != 'admin':
            qs = qs.filter(
                Q(is_public=True) |
                Q(uploaded_by=self.request.user) |
                Q(assigned_faculty=self.request.user)
            )
        return qs


class RepositoryDownloadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk, file_id=None):
        repository = get_object_or_404(Repository, pk=pk, is_deleted=False)
        if not user_can_access_repository(request.user, repository):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        output_file = get_object_or_404(RepositoryFile, pk=file_id, repository=repository) if file_id else repository.files.order_by('-version').first()
        if not output_file:
            raise Http404('No files found.')
        if not os.path.exists(output_file.file.path):
            raise Http404('File not found on server.')
        return FileResponse(open(output_file.file.path, 'rb'), as_attachment=True, filename=output_file.original_filename)


class RepositoryPreviewView(APIView):
    permission_classes = []
    authentication_classes = []
    CONTENT_TYPES = PreviewFileView.CONTENT_TYPES

    def _get_user(self, request):
        return PreviewFileView()._get_user(request)

    def get(self, request, pk, file_id=None):
        user = self._get_user(request)
        if not user:
            return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
        repository = get_object_or_404(Repository, pk=pk, is_deleted=False)
        if not user_can_access_repository(user, repository):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        output_file = get_object_or_404(RepositoryFile, pk=file_id, repository=repository) if file_id else repository.files.order_by('-version').first()
        if not output_file:
            raise Http404('No files found.')
        if not os.path.exists(output_file.file.path):
            raise Http404('File not found on server.')
        ext = output_file.original_filename.rsplit('.', 1)[-1].lower() if '.' in output_file.original_filename else ''
        content_type = self.CONTENT_TYPES.get(ext, 'application/octet-stream')
        response = FileResponse(open(output_file.file.path, 'rb'), content_type=content_type)
        response['Content-Disposition'] = f'inline; filename="{output_file.original_filename}"'
        return response


class RepositoryBrowseFileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk, file_id=None):
        repository = get_object_or_404(Repository, pk=pk, is_deleted=False)
        if not user_can_access_repository(request.user, repository):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        output_file = get_object_or_404(RepositoryFile, pk=file_id, repository=repository) if file_id else repository.files.order_by('-version').first()
        if not output_file:
            return Response({'detail': 'No files found.'}, status=status.HTTP_404_NOT_FOUND)
        if not os.path.exists(output_file.file.path):
            return Response({'detail': 'File not found on server.'}, status=status.HTTP_404_NOT_FOUND)
        path = request.query_params.get('path', '')
        result = browse_file(output_file.file.path, output_file.original_filename, path)
        result['file_id'] = output_file.id
        result['original_filename'] = output_file.original_filename
        result['version'] = output_file.version
        return Response(result)


class RepositoryFileContentView(APIView):
    permission_classes = []
    authentication_classes = []
    CONTENT_TYPES = FileContentView.CONTENT_TYPES

    def _get_user(self, request):
        return FileContentView()._get_user(request)

    def get(self, request, pk, file_id=None):
        user = self._get_user(request)
        if not user:
            return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
        repository = get_object_or_404(Repository, pk=pk, is_deleted=False)
        if not user_can_access_repository(user, repository):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        output_file = get_object_or_404(RepositoryFile, pk=file_id, repository=repository) if file_id else repository.files.order_by('-version').first()
        if not output_file:
            return Response({'detail': 'No files found.'}, status=status.HTTP_404_NOT_FOUND)
        if not os.path.exists(output_file.file.path):
            return Response({'detail': 'File not found on server.'}, status=status.HTTP_404_NOT_FOUND)
        inner_path = request.query_params.get('path', '')
        data, filename, file_type = read_file_content(output_file.file.path, output_file.original_filename, inner_path)
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
        if file_type == 'text':
            response = HttpResponse(data[:MAX_PREVIEW_SIZE].decode('utf-8', errors='replace'), content_type='text/plain; charset=utf-8')
            response['Content-Disposition'] = f'inline; filename="{filename}"'
            if len(data) > MAX_PREVIEW_SIZE:
                response['X-Truncated'] = 'true'
            return response
        if file_type in ('image', 'pdf'):
            response = HttpResponse(data, content_type=self.CONTENT_TYPES.get(ext, 'application/octet-stream'))
            response['Content-Disposition'] = f'inline; filename="{filename}"'
            return response
        response = HttpResponse(data, content_type='application/octet-stream')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class RunRepositoryCodeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk, file_id=None):
        repository = get_object_or_404(Repository, pk=pk, is_deleted=False)
        if not user_can_access_repository(request.user, repository):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        output_file = get_object_or_404(RepositoryFile, pk=file_id, repository=repository) if file_id else repository.files.order_by('-version').first()
        if not output_file:
            return Response({'detail': 'No files found.'}, status=status.HTTP_404_NOT_FOUND)
        if not os.path.exists(output_file.file.path):
            return Response({'detail': 'File not found on server.'}, status=status.HTTP_404_NOT_FOUND)
        result = run_repository_file(
            file_path=output_file.file.path,
            original_filename=output_file.original_filename,
            stdin_input=request.data.get('stdin_input', ''),
            entry_override=request.data.get('entry_file', ''),
        )
        return Response(result)


class RepositoryRunnableFilesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk, file_id=None):
        repository = get_object_or_404(Repository, pk=pk, is_deleted=False)
        if not user_can_access_repository(request.user, repository):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        output_file = get_object_or_404(RepositoryFile, pk=file_id, repository=repository) if file_id else repository.files.order_by('-version').first()
        if not output_file:
            return Response({'detail': 'No files found.'}, status=status.HTTP_404_NOT_FOUND)
        if not os.path.exists(output_file.file.path):
            return Response({'detail': 'File not found on server.'}, status=status.HTTP_404_NOT_FOUND)
        files = list_runnable_files(output_file.file.path, output_file.original_filename)
        return Response({'file_id': output_file.id, 'original_filename': output_file.original_filename, 'runnable_files': files})


class ArchiveDocumentListCreateView(generics.ListCreateAPIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ArchiveDocumentCreateSerializer
        return ArchiveDocumentListSerializer

    def get_queryset(self):
        qs = ArchiveDocument.objects.filter(is_deleted=False).select_related(
            'uploaded_by', 'linked_repository', 'linked_repository__created_by',
            'assigned_faculty', 'reviewed_by',
        )
        user = self.request.user
        if user.role != 'admin':
            qs = qs.filter(Q(is_public=True) | Q(uploaded_by=user) | Q(assigned_faculty=user))
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(title__icontains=search) |
                Q(abstract__icontains=search) |
                Q(author__icontains=search) |
                Q(department__icontains=search) |
                Q(course__icontains=search)
            )
        department = self.request.query_params.get('department', '').strip()
        if department:
            qs = qs.filter(department__icontains=department)
        course = self.request.query_params.get('course', '').strip()
        if course:
            qs = qs.filter(course__icontains=course)
        linked = self.request.query_params.get('linked')
        if linked == 'true':
            qs = qs.exclude(system_link='')
        elif linked == 'false':
            qs = qs.filter(system_link='')
        repository_id = self.request.query_params.get('repository_id')
        if repository_id:
            qs = qs.filter(linked_repository_id=repository_id)
        if self.request.query_params.get('mine') == 'true':
            qs = qs.filter(uploaded_by=self.request.user)
        if self.request.query_params.get('assigned') == 'true':
            qs = qs.filter(assigned_faculty=self.request.user)
        return qs


class ArchiveDocumentDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, IsArchiveOwnerOrAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        qs = ArchiveDocument.objects.filter(is_deleted=False).select_related(
            'uploaded_by', 'linked_repository', 'linked_repository__created_by',
            'assigned_faculty', 'reviewed_by',
        )
        user = self.request.user
        if user.role != 'admin':
            qs = qs.filter(Q(is_public=True) | Q(uploaded_by=user) | Q(assigned_faculty=user))
        return qs

    def get_serializer_class(self):
        if self.request.method in ['PATCH', 'PUT']:
            return ArchiveDocumentUpdateSerializer
        return ArchiveDocumentDetailSerializer

    def perform_update(self, serializer):
        uploaded_file = serializer.validated_data.get('file')
        instance = serializer.save()
        if instance.file and not instance.original_filename:
            instance.original_filename = instance.file.name
        if instance.file and hasattr(instance.file, 'size'):
            instance.file_size = instance.file.size
        if uploaded_file:
            latest = instance.versions.order_by('-version').first()
            ArchiveDocumentVersion.objects.create(
                archive_document=instance,
                file=instance.file.name,
                original_filename=uploaded_file.name,
                file_size=instance.file_size,
                version=(latest.version + 1) if latest else 1,
                change_notes='Updated document file',
                uploaded_by=self.request.user,
            )
            instance.original_filename = uploaded_file.name
            instance.is_approved = False
            instance.is_rejected = False
            instance.rejection_reason = ''
            instance.revision_comment = ''
            instance.reviewed_by = None
            instance.reviewed_at = None
        instance.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_deleted = True
        instance.save(update_fields=['is_deleted'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ArchiveDocumentDownloadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk, version_id=None):
        doc = get_object_or_404(ArchiveDocument, pk=pk, is_deleted=False)
        if not user_can_access_archive(request.user, doc):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)

        version = None
        if version_id:
            version = get_object_or_404(ArchiveDocumentVersion, pk=version_id, archive_document=doc)
        file_field = version.file if version else doc.file
        original_filename = version.original_filename if version else doc.original_filename

        if not os.path.exists(file_field.path):
            raise Http404('File not found on server.')

        return FileResponse(
            open(file_field.path, 'rb'),
            as_attachment=True,
            filename=original_filename,
        )


class ArchiveDocumentVersionHistoryView(generics.ListAPIView):
    serializer_class = ArchiveDocumentVersionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        doc = get_object_or_404(ArchiveDocument, pk=self.kwargs['pk'], is_deleted=False)
        if not user_can_access_archive(self.request.user, doc):
            return ArchiveDocumentVersion.objects.none()
        return ArchiveDocumentVersion.objects.filter(archive_document=doc)


class ArchiveDocumentReviseView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [permissions.IsAuthenticated, IsArchiveOwnerOrAdmin]

    def post(self, request, pk):
        doc = get_object_or_404(ArchiveDocument, pk=pk, is_deleted=False)
        self.check_object_permissions(request, doc)

        serializer = ArchiveDocumentRevisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        latest = doc.versions.order_by('-version').first()
        new_version = (latest.version + 1) if latest else 1
        uploaded_file = serializer.validated_data['file']

        version = ArchiveDocumentVersion.objects.create(
            archive_document=doc,
            file=uploaded_file,
            original_filename=uploaded_file.name,
            file_size=uploaded_file.size,
            version=new_version,
            change_notes=serializer.validated_data.get('change_notes', ''),
            uploaded_by=request.user,
        )

        doc.file = version.file.name
        doc.original_filename = version.original_filename
        doc.file_size = version.file_size
        doc.is_approved = False
        doc.is_rejected = False
        doc.rejection_reason = ''
        doc.revision_comment = ''
        doc.reviewed_by = None
        doc.reviewed_at = None
        doc.save(update_fields=[
            'file', 'original_filename', 'file_size',
            'is_approved', 'is_rejected', 'rejection_reason', 'revision_comment',
            'reviewed_by', 'reviewed_at', 'updated_at',
        ])

        return Response(
            ArchiveDocumentVersionSerializer(version, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class ArchiveDocumentPreviewView(APIView):
    permission_classes = []
    authentication_classes = []
    CONTENT_TYPES = PreviewFileView.CONTENT_TYPES

    def _get_user(self, request):
        return PreviewFileView()._get_user(request)

    def get(self, request, pk, version_id=None):
        user = self._get_user(request)
        if not user:
            return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
        doc = get_object_or_404(ArchiveDocument, pk=pk, is_deleted=False)
        if not user_can_access_archive(user, doc):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        version = None
        if version_id:
            version = get_object_or_404(ArchiveDocumentVersion, pk=version_id, archive_document=doc)
        file_field = version.file if version else doc.file
        original_filename = version.original_filename if version else doc.original_filename
        if not os.path.exists(file_field.path):
            raise Http404('File not found on server.')
        ext = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else ''
        content_type = self.CONTENT_TYPES.get(ext, 'application/octet-stream')
        response = FileResponse(open(file_field.path, 'rb'), content_type=content_type)
        response['Content-Disposition'] = f'inline; filename="{original_filename}"'
        response['X-Frame-Options'] = 'SAMEORIGIN'
        return response


class ArchiveDocumentReviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        doc = get_object_or_404(ArchiveDocument, pk=pk, is_deleted=False)
        if not user_can_review_archive(request.user, doc):
            return Response(
                {'detail': 'Only the assigned faculty can review this paper.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ArchiveDocumentReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = serializer.validated_data['action']
        comment = serializer.validated_data.get('comment', '')

        if action == 'approve':
            doc.is_approved = True
            doc.is_rejected = False
            doc.rejection_reason = ''
            doc.revision_comment = comment
        elif action == 'reject':
            doc.is_approved = False
            doc.is_rejected = True
            doc.rejection_reason = comment
            doc.revision_comment = comment
        else:
            doc.is_approved = False
            doc.is_rejected = True
            doc.rejection_reason = ''
            doc.revision_comment = comment

        doc.reviewed_by = request.user
        doc.reviewed_at = timezone.now()
        doc.save(update_fields=[
            'is_approved', 'is_rejected', 'rejection_reason', 'revision_comment',
            'reviewed_by', 'reviewed_at', 'updated_at',
        ])
        return Response(ArchiveDocumentDetailSerializer(doc, context={'request': request}).data)


class DepartmentListCreateView(generics.ListCreateAPIView):
    serializer_class = DepartmentSerializer
    pagination_class = None

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.IsAuthenticated()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = Department.objects.all()
        if self.request.user.role != 'admin':
            qs = qs.filter(is_active=True)
        return qs


class DepartmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = DepartmentSerializer
    permission_classes = [IsAdminUser]
    queryset = Department.objects.all()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class CourseListCreateView(generics.ListCreateAPIView):
    serializer_class = CourseSerializer
    pagination_class = None

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.IsAuthenticated()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = Course.objects.select_related('department')
        if self.request.user.role != 'admin':
            qs = qs.filter(is_active=True).filter(Q(department__is_active=True) | Q(department__isnull=True))
        department_id = self.request.query_params.get('department')
        if department_id:
            qs = qs.filter(department_id=department_id)
        return qs


class CourseDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CourseSerializer
    permission_classes = [IsAdminUser]
    queryset = Course.objects.select_related('department')

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)
