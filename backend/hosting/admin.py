from django.contrib import admin

from .models import HostingSession


@admin.register(HostingSession)
class HostingSessionAdmin(admin.ModelAdmin):
    list_display = ('name', 'project_type', 'status', 'port', 'container_status', 'health_status', 'started_by', 'expires_at')
    list_filter = ('project_type', 'status')
    search_fields = ('name', 'project_dir', 'start_command')
    readonly_fields = tuple(field.name for field in HostingSession._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False
