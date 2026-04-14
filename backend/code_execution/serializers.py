from rest_framework import serializers
from .models import CodeSubmission


class CodeSubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CodeSubmission
        fields = [
            'id', 'language', 'source_code', 'stdin_input',
            'status', 'stdout_output', 'stderr_output',
            'exit_code', 'execution_time_ms', 'created_at',
        ]
        read_only_fields = [
            'id', 'status', 'stdout_output', 'stderr_output',
            'exit_code', 'execution_time_ms', 'created_at',
        ]

    def validate_language(self, value):
        allowed = ['python', 'java', 'cpp']
        if value not in allowed:
            raise serializers.ValidationError(
                f"Unsupported language '{value}'. Allowed: {', '.join(allowed)}"
            )
        return value

    def validate_source_code(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Source code cannot be empty.")
        if len(value) > 50_000:
            raise serializers.ValidationError("Source code exceeds 50,000 character limit.")
        return value


class ExecuteRequestSerializer(serializers.Serializer):
    language = serializers.ChoiceField(choices=['python', 'java', 'cpp'])
    source_code = serializers.CharField(max_length=50_000)
    stdin_input = serializers.CharField(required=False, default='', allow_blank=True)
    stdin = serializers.CharField(required=False, allow_blank=True, write_only=True)

    def validate(self, attrs):
        # Backward/alternate key support for clients that send `stdin`.
        if 'stdin' in attrs and not attrs.get('stdin_input'):
            attrs['stdin_input'] = attrs.get('stdin', '')
        attrs.pop('stdin', None)
        return attrs


class TranslateRequestSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=10_000)
    source_lang = serializers.ChoiceField(
        choices=['en', 'fil'],
        default='en',
        required=False
    )
    target_lang = serializers.ChoiceField(
        choices=['en', 'fil'],
        default='fil',
        required=False
    )

    def validate(self, data):
        if data.get('source_lang') == data.get('target_lang'):
            raise serializers.ValidationError(
                "source_lang and target_lang must be different."
            )
        return data
