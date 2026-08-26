from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .manager import (
    HostingError,
    active_session,
    create_session_from_upload,
    read_logs,
    restart_session,
    stop_session,
)
from .models import HostingSession
from .permissions import IsAdmin
from .serializers import HostingSessionSerializer


class HostingStatusView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        session = active_session() or HostingSession.objects.first()
        data = HostingSessionSerializer(session).data if session else None
        return Response({'session': data})


class HostingStartView(APIView):
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
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(HostingSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class HostingStopView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        session = active_session()
        if not session:
            return Response({'detail': 'No website is currently running.'}, status=status.HTTP_400_BAD_REQUEST)
        session = stop_session(session, force=False, status=HostingSession.STATUS_STOPPED)
        return Response(HostingSessionSerializer(session).data)


class HostingKillView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        session = active_session() or HostingSession.objects.first()
        if not session:
            return Response({'detail': 'No hosting session exists.'}, status=status.HTTP_400_BAD_REQUEST)
        session = stop_session(session, force=True, status=HostingSession.STATUS_KILLED)
        return Response(HostingSessionSerializer(session).data)


class HostingRestartView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        session = active_session() or HostingSession.objects.first()
        if not session:
            return Response({'detail': 'No hosting session exists.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            session = restart_session(session)
        except HostingError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(HostingSessionSerializer(session).data)


class HostingLogsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        session = active_session() or HostingSession.objects.first()
        return Response({'logs': read_logs(session), 'session': HostingSessionSerializer(session).data if session else None})
