from django.db import models
from django.conf import settings


class CodeSubmission(models.Model):
    LANGUAGE_CHOICES = [
        ('python', 'Python'),
        ('java', 'Java'),
        ('cpp', 'C++'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('running', 'Running'),
        ('success', 'Success'),
        ('error', 'Error'),
        ('timeout', 'Timeout'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='code_submissions'
    )
    language = models.CharField(max_length=20, choices=LANGUAGE_CHOICES)
    source_code = models.TextField()
    stdin_input = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    stdout_output = models.TextField(blank=True, default='')
    stderr_output = models.TextField(blank=True, default='')
    exit_code = models.IntegerField(null=True, blank=True)
    execution_time_ms = models.FloatField(null=True, blank=True)
    memory_used_kb = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.language} by {self.user} @ {self.created_at:%Y-%m-%d %H:%M}"


class TranslationCache(models.Model):
    """Cache for translated research abstracts to reduce API calls."""
    source_text_hash = models.CharField(max_length=64, unique=True, db_index=True)
    source_text = models.TextField()
    source_lang = models.CharField(max_length=10, default='en')
    target_lang = models.CharField(max_length=10, default='fil')
    translated_text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Translation {self.source_lang} -> {self.target_lang} [{self.source_text_hash[:8]}]"
