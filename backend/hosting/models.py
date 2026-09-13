from datetime import timedelta
import uuid

from django import VERSION as DJANGO_VERSION
from django.conf import settings
from django.db import models
from django.utils import timezone


class HostingSession(models.Model):
    TYPE_STATIC = 'static'
    TYPE_PHP = 'php'
    TYPE_PYTHON = 'python'
    TYPE_NODE = 'node'
    TYPE_RUBY = 'ruby'
    TYPE_CPP = 'cpp'
    TYPE_FULLSTACK = 'fullstack'

    TYPE_CHOICES = [
        (TYPE_STATIC, 'HTML / CSS / JavaScript'),
        (TYPE_PHP, 'PHP'),
        (TYPE_PYTHON, 'Python'),
        (TYPE_NODE, 'Node / JavaScript'),
        (TYPE_RUBY, 'Ruby'),
        (TYPE_CPP, 'C++'),
        (TYPE_FULLSTACK, 'Frontend + backend + database'),
    ]

    STATUS_UPLOADED = 'uploaded'
    STATUS_VALIDATING = 'validating'
    STATUS_EXTRACTING = 'extracting'
    STATUS_BUILDING = 'building'
    STATUS_STARTING = 'starting'
    STATUS_STOPPING = 'stopping'
    STATUS_RUNNING = 'running'
    STATUS_STOPPED = 'stopped'
    STATUS_FAILED = 'failed'
    STATUS_EXPIRED = 'expired'
    STATUS_KILLED = 'killed'

    STATUS_CHOICES = [
        (STATUS_UPLOADED, 'Uploaded'),
        (STATUS_VALIDATING, 'Validating'),
        (STATUS_EXTRACTING, 'Extracting'),
        (STATUS_BUILDING, 'Building'),
        (STATUS_STARTING, 'Starting'),
        (STATUS_STOPPING, 'Stopping'),
        (STATUS_RUNNING, 'Running'),
        (STATUS_STOPPED, 'Stopped'),
        (STATUS_FAILED, 'Failed'),
        (STATUS_EXPIRED, 'Expired'),
        (STATUS_KILLED, 'Killed'),
    ]

    ACTIVE_STATUSES = ('uploaded', 'validating', 'extracting', 'building', 'starting', 'running', 'stopping')

    name = models.CharField(max_length=180)
    project_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_STOPPED)
    port = models.PositiveIntegerField(null=True, blank=True)
    pid = models.PositiveIntegerField(null=True, blank=True)
    project_dir = models.CharField(max_length=500)
    entrypoint = models.CharField(max_length=260, blank=True)
    start_command = models.CharField(max_length=500, blank=True)
    log_file = models.CharField(max_length=500, blank=True)
    error_message = models.TextField(blank=True)
    deployment_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    # NULL releases the slot; UNIQUE makes simultaneous reservations impossible.
    active_slot = models.PositiveSmallIntegerField(null=True, blank=True, unique=True, editable=False)
    source_zip = models.CharField(max_length=500, blank=True)
    is_default = models.BooleanField(default=False)
    container_id = models.CharField(max_length=64, blank=True)
    container_name = models.CharField(max_length=80, blank=True)
    internal_port = models.PositiveIntegerField(default=8080)
    container_status = models.CharField(max_length=40, blank=True)
    health_status = models.CharField(max_length=40, default='unknown')
    health_failures = models.PositiveSmallIntegerField(default=0)
    exit_code = models.IntegerField(null=True, blank=True)
    restart_requested = models.BooleanField(default=False)
    stop_target = models.CharField(max_length=20, default='stopped')
    archive_document = models.ForeignKey(
        'repository.ArchiveDocument',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hosting_sessions',
    )
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
            models.Index(fields=['archive_document'], name='hosting_hos_archive_7f3bf5_idx'),
        ]
        constraints = [models.UniqueConstraint(
            fields=['archive_document'], condition=models.Q(is_default=True),
            name='hosting_one_default_per_archive',
        ), models.CheckConstraint(
            name='hosting_active_slot_matches_status',
            **{("condition" if DJANGO_VERSION >= (5, 1) else "check"): (
                models.Q(status__in=('uploaded', 'validating', 'extracting', 'building', 'starting', 'running', 'stopping'), active_slot=1, active_slot__isnull=False)
                | (~models.Q(status__in=('uploaded', 'validating', 'extracting', 'building', 'starting', 'running', 'stopping')) & models.Q(active_slot__isnull=True))
            )},
        )]

    def __str__(self):
        return f'{self.name} ({self.status})'

    @property
    def preview_url(self):
        if self.port and self.status == self.STATUS_RUNNING and self.expires_at and self.expires_at > timezone.now():
            domain = settings.DEPLOYMENT_BASE_DOMAIN
            if domain:
                return f'{settings.DEPLOYMENT_PUBLIC_SCHEME}://{self.deployment_id}.{domain}/'
            if self.project_type == self.TYPE_FULLSTACK:
                return f'{settings.DEPLOYMENT_FULLSTACK_PUBLIC_SCHEME}://{self.deployment_id}.{settings.DEPLOYMENT_FULLSTACK_BASE_DOMAIN}/'
            return f'{settings.DEPLOYMENT_PUBLIC_ORIGIN}/temp/{self.deployment_id}/'
        return ''

    @property
    def seconds_remaining(self):
        if not self.expires_at or self.status != self.STATUS_RUNNING:
            return 0
        return max(0, int((self.expires_at - timezone.now()).total_seconds()))

    def set_expiry(self):
        minutes = settings.DEPLOYMENT_DURATION_MINUTES
        self.started_at = timezone.now()
        self.expires_at = self.started_at + timedelta(minutes=minutes)
