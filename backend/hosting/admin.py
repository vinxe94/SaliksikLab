from django.contrib import admin

from .models import HostingSession


@admin.register(HostingSession)
class HostingSessionAdmin(admin.ModelAdmin):
    list_display = ('name', 'project_type', 'status', 'port', 'pid', 'started_by', 'expires_at')
    list_filter = ('project_type', 'status')
    search_fields = ('name', 'project_dir', 'start_command')
    readonly_fields = ('created_at', 'started_at', 'expires_at', 'stopped_at', 'updated_at')
