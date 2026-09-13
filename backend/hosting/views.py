from rest_framework import status
from django.shortcuts import get_object_or_404
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.views import APIView

from .manager import (
    HostingError,
    active_session,
    create_session_from_upload,
    delete_saved_system,
    read_logs,
    restart_session,
    saved_systems,
    start_saved_system,
    stop_session,
)
from .models import HostingSession
from .permissions import IsAdmin
from .serializers import HostingSessionSerializer, PublicHostingSessionSerializer
from .services.deployment_service import worker_is_alive
from .services.upload_service import LimitedHostingUpload
from repository.models import ArchiveDocument


def user_can_access_archive(user, doc):
    return (
        user.is_authenticated and (
            user.role == 'admin' or doc.is_approved
        )
    )


def user_can_configure_archive(user, doc):
    return user.is_authenticated and user.role == 'admin'


def get_accessible_archive(request, archive_id, require_configure=False):
    doc = get_object_or_404(ArchiveDocument, pk=archive_id, is_deleted=False)
    allowed = user_can_configure_archive(request.user, doc) if require_configure else user_can_access_archive(request.user, doc)
    if not allowed:
        return None, Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
    return doc, None


def selected_session(request, archive_document=None):
    sessions = HostingSession.objects.all()
    if archive_document is not None:
        sessions = sessions.filter(archive_document=archive_document)
    if request.data.get('session_id') is not None:
        try:
            session_id = int(request.data['session_id'])
            if session_id < 1 or session_id > 9223372036854775807:
                raise ValueError
        except (ValueError, TypeError):
            raise ValidationError({'session_id': 'Provide a positive session ID.'})
        return get_object_or_404(sessions, pk=session_id)
    return active_session(archive_document) or (sessions.filter(is_default=True).first() if archive_document else None) or sessions.first()


class HostingStatusView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        session = active_session() or HostingSession.objects.first()
        data = HostingSessionSerializer(session).data if session else None
        return Response({'session': data, 'worker_online': worker_is_alive(), 'active_deployment_id': session.id if session and session.active_slot else None})


class HostingSavedSystemListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response({'systems': HostingSessionSerializer(saved_systems(), many=True).data})


class HostingStartView(LimitedHostingUpload, APIView):
    permission_classes = [IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        try:
            session = create_session_from_upload(
                uploaded_file=request.FILES.get('site_zip'),
                project_type=request.data.get('project_type', ''),
                user=request.user,
                name=request.data.get('name', ''),
                entrypoint=request.data.get('entrypoint', ''),
                start_command=request.data.get('start_command', ''),
            )
        except HostingError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except APIException:
            raise
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(HostingSessionSerializer(session).data, status=status.HTTP_202_ACCEPTED)


class HostingStopView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        session = selected_session(request)
        if not session:
            return Response({'session': None})
        session = stop_session(session, force=False, status=HostingSession.STATUS_STOPPED)
        return Response(HostingSessionSerializer(session).data)


class HostingKillView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        session = selected_session(request)
        if not session:
            return Response({'detail': 'No hosting session exists.'}, status=status.HTTP_400_BAD_REQUEST)
        session = stop_session(session, force=True, status=HostingSession.STATUS_KILLED)
        return Response(HostingSessionSerializer(session).data)


class HostingRestartView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        session = selected_session(request)
        if not session:
            return Response({'detail': 'No hosting session exists.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            session = restart_session(session)
        except HostingError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(HostingSessionSerializer(session).data)


class HostingSavedSystemStartView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, session_id):
        try:
            session = start_saved_system(session_id)
        except HostingError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(HostingSessionSerializer(session).data)


class HostingSavedSystemDeleteView(APIView):
    permission_classes = [IsAdmin]

    def delete(self, request, session_id):
        try:
            deleted_count = delete_saved_system(session_id)
        except HostingError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'deleted': deleted_count})


class HostingLogsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        session = active_session() or HostingSession.objects.first()
        return Response({'logs': read_logs(session), 'session': HostingSessionSerializer(session).data if session else None})


class ArchiveHostingStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, archive_id):
        doc, error = get_accessible_archive(request, archive_id)
        if error:
            return error
        sessions = HostingSession.objects.filter(archive_document=doc)
        default = sessions.filter(is_default=True).first()
        session = active_session(doc) or default or sessions.first()
        serializer = HostingSessionSerializer if request.user.role == 'admin' else PublicHostingSessionSerializer
        systems = saved_systems(doc)
        return Response({
            'session': serializer(session).data if session else None,
            'systems': serializer(systems, many=True).data,
            'active_deployment_id': active_session().id if active_session() else None,
            'worker_online': worker_is_alive(),
            'default_session_id': default.id if default else None,
        })


class ArchiveHostingStartView(LimitedHostingUpload, APIView):
    permission_classes = [IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, archive_id):
        doc, error = get_accessible_archive(request, archive_id, require_configure=True)
        if error:
            return error
        try:
            session = create_session_from_upload(
                uploaded_file=request.FILES.get('site_zip'),
                project_type=request.data.get('project_type', ''),
                user=request.user,
                name=request.data.get('name', '') or doc.title,
                entrypoint=request.data.get('entrypoint', ''),
                start_command=request.data.get('start_command', ''),
                archive_document=doc,
            )
        except HostingError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except APIException:
            raise
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(HostingSessionSerializer(session).data, status=status.HTTP_202_ACCEPTED)


class ArchiveHostingSavedSystemStartView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, archive_id, session_id):
        doc, error = get_accessible_archive(request, archive_id)
        if error:
            return error
        session = get_object_or_404(HostingSession, pk=session_id, archive_document=doc)
        try:
            session = restart_session(session)
        except HostingError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(HostingSessionSerializer(session).data)


class ArchiveHostingStopView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, archive_id):
        doc, error = get_accessible_archive(request, archive_id)
        if error:
            return error
        session = selected_session(request, doc)
        if not session:
            return Response({'session': None})
        session = stop_session(session, force=False, status=HostingSession.STATUS_STOPPED)
        return Response(HostingSessionSerializer(session).data)


class ArchiveHostingRestartView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, archive_id):
        doc, error = get_accessible_archive(request, archive_id)
        if error:
            return error
        session = selected_session(request, doc)
        if not session:
            return Response({'detail': 'No hosting configuration exists for this archive.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            session = restart_session(session)
        except HostingError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(HostingSessionSerializer(session).data)


class ArchiveHostingKillView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, archive_id):
        doc, error = get_accessible_archive(request, archive_id, require_configure=True)
        if error:
            return error
        session = selected_session(request, doc)
        if not session:
            return Response({'detail': 'No hosting configuration exists for this archive.'}, status=status.HTTP_400_BAD_REQUEST)
        session = stop_session(session, force=True, status=HostingSession.STATUS_KILLED)
        return Response(HostingSessionSerializer(session).data)


class ArchiveHostingLogsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, archive_id):
        doc, error = get_accessible_archive(request, archive_id)
        if error:
            return error
        sessions = HostingSession.objects.filter(archive_document=doc)
        session = active_session(doc) or sessions.filter(is_default=True).first() or sessions.first()
        return Response({
            'logs': read_logs(session),
            'session': HostingSessionSerializer(session).data if session else None,
        })
