from rest_framework import serializers

from .models import HostingSession


class HostingSessionSerializer(serializers.ModelSerializer):
    preview_url = serializers.CharField(read_only=True)
    seconds_remaining = serializers.IntegerField(read_only=True)
    started_by_email = serializers.EmailField(source='started_by.email', read_only=True)

    class Meta:
        model = HostingSession
        fields = [
            'id',
            'name',
            'project_type',
            'status',
            'port',
            'pid',
            'project_dir',
            'entrypoint',
            'start_command',
            'log_file',
            'error_message',
            'started_by_email',
            'created_at',
            'started_at',
            'expires_at',
            'stopped_at',
            'preview_url',
            'seconds_remaining',
        ]
        read_only_fields = [
            'id',
            'status',
            'port',
            'pid',
            'project_dir',
            'log_file',
            'error_message',
            'started_by_email',
            'created_at',
            'started_at',
            'expires_at',
            'stopped_at',
            'preview_url',
            'seconds_remaining',
        ]
