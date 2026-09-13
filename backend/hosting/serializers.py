from rest_framework import serializers

from .models import HostingSession


class HostingSessionSerializer(serializers.ModelSerializer):
    preview_url = serializers.CharField(read_only=True)
    seconds_remaining = serializers.IntegerField(read_only=True)
    started_by_email = serializers.EmailField(source='started_by.email', read_only=True)
    archive_document = serializers.IntegerField(source='archive_document_id', read_only=True)
    host_port = serializers.IntegerField(source='port', read_only=True)

    class Meta:
        model = HostingSession
        fields = [
            'id',
            'deployment_id', 'source_zip', 'container_id', 'container_name', 'internal_port',
            'host_port', 'container_status', 'health_status', 'health_failures', 'exit_code', 'restart_requested',
            'name',
            'is_default',
            'project_type',
            'status',
            'port',
            'pid',
            'project_dir',
            'entrypoint',
            'start_command',
            'log_file',
            'error_message',
            'archive_document',
            'started_by_email',
            'created_at',
            'started_at',
            'expires_at',
            'stopped_at',
            'preview_url',
            'seconds_remaining',
        ]
        read_only_fields = fields


class PublicHostingSessionSerializer(serializers.ModelSerializer):
    """Ordinary archive readers see availability, never operational details/logs."""
    preview_url = serializers.CharField(read_only=True)
    seconds_remaining = serializers.IntegerField(read_only=True)

    class Meta:
        model = HostingSession
        fields = ('id', 'deployment_id', 'name', 'project_type', 'is_default', 'status', 'preview_url',
                  'started_at', 'expires_at', 'seconds_remaining', 'health_status')
        read_only_fields = fields
