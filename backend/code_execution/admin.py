from django.contrib import admin
from .models import CodeSubmission, TranslationCache


@admin.register(CodeSubmission)
class CodeSubmissionAdmin(admin.ModelAdmin):
    list_display  = ('id', 'user', 'language', 'status', 'execution_time_ms', 'created_at')
    list_filter   = ('language', 'status')
    search_fields = ('user__email', 'source_code')
    readonly_fields = ('stdout_output', 'stderr_output', 'exit_code', 'execution_time_ms')
    ordering = ('-created_at',)


@admin.register(TranslationCache)
class TranslationCacheAdmin(admin.ModelAdmin):
    list_display  = ('source_text_hash', 'source_lang', 'target_lang', 'created_at')
    search_fields = ('source_text', 'translated_text')
    readonly_fields = ('source_text_hash', 'created_at')
    ordering = ('-created_at',)
