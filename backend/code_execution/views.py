import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny

from .executor import execute_code
from .translation import translate_text
from .serializers import ExecuteRequestSerializer, TranslateRequestSerializer
from .models import CodeSubmission

logger = logging.getLogger(__name__)


class ExecuteCodeView(APIView):
    """
    POST /api/code/execute/

    Execute code in a secure sandbox and return the result.
    Saves an execution log in the database.

    Request body:
        {
            "language": "python" | "java" | "cpp",
            "source_code": "<code>",
            "stdin_input": ""          // optional
        }

    Response:
        {
            "id": <submission_id>,
            "language": "python",
            "status": "success" | "error" | "timeout",
            "stdout": "...",
            "stderr": "...",
            "exit_code": 0,
            "execution_time_ms": 123.4
        }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = ExecuteRequestSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        language    = ser.validated_data['language']
        source_code = ser.validated_data['source_code']
        stdin_input = ser.validated_data['stdin_input']

        # Create a pending record
        submission = CodeSubmission.objects.create(
            user=request.user,
            language=language,
            source_code=source_code,
            stdin_input=stdin_input,
            status='running',
        )

        try:
            result = execute_code(language, source_code, stdin_input)
        except Exception as exc:
            logger.exception(f"Executor crashed: {exc}")
            submission.status = 'error'
            submission.stderr_output = f'Internal server error: {exc}'
            submission.exit_code = -99
            submission.save()
            return Response(
                {'error': 'Internal execution error. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Persist result
        submission.status         = result['status']
        submission.stdout_output  = result.get('stdout', '')
        submission.stderr_output  = result.get('stderr', '')
        submission.exit_code      = result.get('exit_code')
        submission.execution_time_ms = result.get('time_ms')
        submission.save()

        return Response({
            'id':               submission.id,
            'language':         language,
            'status':           result['status'],
            'stdout':           result.get('stdout', ''),
            'stderr':           result.get('stderr', ''),
            'exit_code':        result.get('exit_code'),
            'execution_time_ms': result.get('time_ms'),
            'timed_out':        result.get('timed_out', False),
        }, status=status.HTTP_200_OK)


class TranslateView(APIView):
    """
    POST /api/code/translate/

    AI-assisted translation of text (optimised for research abstracts).

    Request body:
        {
            "text": "...",
            "source_lang": "en",   // default: "en"
            "target_lang": "fil"   // default: "fil"
        }

    Response:
        {
            "translated": "...",
            "source_lang": "en",
            "target_lang": "fil",
            "cached": true | false,
            "error": null | "..."
        }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = TranslateRequestSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        result = translate_text(
            text=ser.validated_data['text'],
            source_lang=ser.validated_data.get('source_lang', 'en'),
            target_lang=ser.validated_data.get('target_lang', 'fil'),
        )
        return Response(result, status=status.HTTP_200_OK)


class SubmissionHistoryView(APIView):
    """
    GET /api/code/history/

    Returns the authenticated user's 20 most recent code submissions.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        submissions = CodeSubmission.objects.filter(user=request.user)[:20]
        data = [
            {
                'id':               s.id,
                'language':         s.language,
                'status':           s.status,
                'exit_code':        s.exit_code,
                'execution_time_ms': s.execution_time_ms,
                'created_at':       s.created_at.isoformat(),
                'source_code':      s.source_code[:200],   # preview only
            }
            for s in submissions
        ]
        return Response(data)


class SupportedLanguagesView(APIView):
    """
    GET /api/code/languages/

    Returns the list of supported programming languages with metadata.
    Public endpoint (no auth required).
    """
    permission_classes = [AllowAny]

    def get(self, request):
        return Response([
            {
                'id': 'python',
                'label': 'Python 3',
                'label_fil': 'Python 3',
                'extension': '.py',
                'icon': '🐍',
                'description': 'General-purpose, interpreted language.',
                'description_fil': 'Pangkalahatang layunin, interpreted na wika.',
                'version': '3.x',
            },
            {
                'id': 'java',
                'label': 'Java',
                'label_fil': 'Java',
                'extension': '.java',
                'icon': '☕',
                'description': 'Object-oriented, compiled to JVM bytecode.',
                'description_fil': 'Object-oriented, kino-compile sa JVM bytecode.',
                'version': '17+',
            },
            {
                'id': 'cpp',
                'label': 'C++',
                'label_fil': 'C++',
                'extension': '.cpp',
                'icon': '⚙️',
                'description': 'High-performance systems language.',
                'description_fil': 'Mataas na pagganap na systems language.',
                'version': 'C++17',
            },
        ])
