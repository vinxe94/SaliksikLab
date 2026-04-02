import os
from .runner import run_repository_file, list_runnable_files, RunnerError
import csv
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.core.mail import send_mail
from django.conf import settings as django_settings
from django.db.models import Q, Count
from rest_framework import generics, permissions, status, filters
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
import json

from .models import ResearchOutput, OutputFile, DownloadLog
from .serializers import (
    ResearchOutputListSerializer,
    ResearchOutputDetailSerializer,
    ResearchOutputCreateSerializer,
    OutputFileSerializer,
    RevisionSerializer,
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
    """Admin-only JSON export of all research outputs."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        outputs = ResearchOutput.objects.filter(is_deleted=False)
        data = ResearchOutputDetailSerializer(outputs, many=True).data
        return Response({'count': len(data), 'outputs': data})


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
