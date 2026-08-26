from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class HostingSession(models.Model):
    TYPE_STATIC = 'static'
    TYPE_PHP = 'php'
    TYPE_PYTHON = 'python'
    TYPE_NODE = 'node'

    TYPE_CHOICES = [
        (TYPE_STATIC, 'HTML / CSS / JavaScript'),
        (TYPE_PHP, 'PHP'),
        (TYPE_PYTHON, 'Python'),
        (TYPE_NODE, 'Node / JavaScript'),
    ]

    STATUS_STARTING = 'starting'
    STATUS_RUNNING = 'running'
    STATUS_STOPPED = 'stopped'
    STATUS_FAILED = 'failed'
    STATUS_EXPIRED = 'expired'
    STATUS_KILLED = 'killed'

    STATUS_CHOICES = [
        (STATUS_STARTING, 'Starting'),
        (STATUS_RUNNING, 'Running'),
        (STATUS_STOPPED, 'Stopped'),
        (STATUS_FAILED, 'Failed'),
        (STATUS_EXPIRED, 'Expired'),
        (STATUS_KILLED, 'Killed'),
    ]

    name = models.CharField(max_length=180)
    project_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_STARTING)
    port = models.PositiveIntegerField(null=True, blank=True)
    pid = models.PositiveIntegerField(null=True, blank=True)
    project_dir = models.CharField(max_length=500)
    entrypoint = models.CharField(max_length=260, blank=True)
    start_command = models.CharField(max_length=500, blank=True)
    log_file = models.CharField(max_length=500, blank=True)
    error_message = models.TextField(blank=True)
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hosting_sessions',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    stopped_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['expires_at']),
        ]

    def __str__(self):
        return f'{self.name} ({self.status})'

    @property
    def preview_url(self):
        if self.port and self.status == self.STATUS_RUNNING:
            return f'http://127.0.0.1:{self.port}/'
        return ''

    @property
    def seconds_remaining(self):
        if not self.expires_at or self.status != self.STATUS_RUNNING:
            return 0
        return max(0, int((self.expires_at - timezone.now()).total_seconds()))

    def set_expiry(self):
        minutes = getattr(settings, 'TEMP_HOSTING_DURATION_MINUTES', 30)
        self.started_at = timezone.now()
        self.expires_at = self.started_at + timedelta(minutes=minutes)
