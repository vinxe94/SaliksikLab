from django.contrib import admin
from django.utils.html import format_html
from .models import (
    ResearchOutput, OutputFile, DownloadLog,
    Repository, RepositoryFile, ArchiveDocument,
)


class OutputFileInline(admin.TabularInline):
    model = OutputFile
    extra = 0
    readonly_fields = ['original_filename', 'file_size', 'version', 'uploaded_by', 'uploaded_at']
    can_delete = False


@admin.register(ResearchOutput)
class ResearchOutputAdmin(admin.ModelAdmin):
    list_display = ['title', 'output_type', 'author', 'department', 'year',
                    'is_approved', 'is_rejected', 'is_deleted', 'version_count_display', 'created_at']
    list_filter = ['output_type', 'is_approved', 'is_rejected', 'is_deleted', 'department', 'year']
    search_fields = ['title', 'author', 'adviser', 'keywords']
    readonly_fields = ['uploaded_by', 'created_at', 'updated_at']
    actions = ['approve_selected', 'unapprove_selected']
    inlines = [OutputFileInline]

    def version_count_display(self, obj):
        return obj.files.count()
    version_count_display.short_description = 'Versions'

    def approve_selected(self, request, queryset):
        queryset.update(is_approved=True, is_rejected=False, rejection_reason='')
    approve_selected.short_description = 'Approve selected outputs'

    def unapprove_selected(self, request, queryset):
        queryset.update(is_approved=False)
    unapprove_selected.short_description = 'Unapprove selected outputs'


@admin.register(DownloadLog)
class DownloadLogAdmin(admin.ModelAdmin):
    list_display = ['user', 'research_output', 'output_file', 'downloaded_at']
    list_filter = ['downloaded_at']
    search_fields = ['user__email', 'research_output__title']
    readonly_fields = ['user', 'research_output', 'output_file', 'downloaded_at']


class RepositoryFileInline(admin.TabularInline):
    model = RepositoryFile
    extra = 0
    readonly_fields = ['original_filename', 'file_size', 'version', 'uploaded_by', 'uploaded_at']
    can_delete = False


@admin.register(Repository)
class RepositoryAdmin(admin.ModelAdmin):
    list_display = ['title', 'created_by', 'created_at', 'updated_at', 'is_deleted']
    list_filter = ['is_deleted', 'created_at']
    search_fields = ['title', 'description', 'created_by__email']
    readonly_fields = ['created_by', 'created_at', 'updated_at']
    inlines = [RepositoryFileInline]


@admin.register(ArchiveDocument)
class ArchiveDocumentAdmin(admin.ModelAdmin):
    list_display = ['title', 'author', 'linked_repository', 'uploaded_by', 'uploaded_at', 'is_deleted']
    list_filter = ['is_deleted', 'department', 'year', 'uploaded_at']
    search_fields = ['title', 'abstract', 'author', 'department', 'linked_repository__title']
    readonly_fields = ['uploaded_by', 'uploaded_at', 'updated_at', 'original_filename', 'file_size']
