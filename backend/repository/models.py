import os
from django.db import models
from django.conf import settings


def upload_to(instance, filename):
    ext = filename.rsplit('.', 1)[-1].lower()
    return f'outputs/{instance.research_output.id}/v{instance.version}/{filename}'


def repository_upload_to(instance, filename):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    suffix = f'.{ext}' if ext else ''
    repo_id = instance.repository_id or 'new'
    return f'repositories/{repo_id}/v{instance.version}/{filename.rsplit(".", 1)[0] if "." in filename else filename}{suffix}'


def archive_upload_to(instance, filename):
    archive_id = instance.id or 'new'
    return f'archives/{archive_id}/{filename}'


def archive_version_upload_to(instance, filename):
    archive_id = instance.archive_document_id or 'new'
    return f'archives/{archive_id}/v{instance.version}/{filename}'


class ResearchOutput(models.Model):
    TYPE_CHOICES = [
        ('thesis', 'Thesis Manuscript'),
        ('documentation', 'Research Documentation'),
        ('other', 'Research PDF'),
    ]

    title = models.CharField(max_length=500)
    abstract = models.TextField(blank=True)
    output_type = models.CharField(max_length=30, choices=TYPE_CHOICES, default='thesis')
    department = models.CharField(max_length=200)
    year = models.PositiveIntegerField()
    keywords = models.JSONField(default=list, blank=True)
    author = models.CharField(max_length=300)
    adviser = models.CharField(max_length=300, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='uploads'
    )
    is_approved = models.BooleanField(default=False)
    is_rejected = models.BooleanField(default=False)
    rejection_reason = models.TextField(blank=True)
    is_deleted = models.BooleanField(default=False)
    course = models.CharField(max_length=200, blank=True)
    co_authors = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title

    @property
    def current_version(self):
        return self.files.order_by('-version').first()

    @property
    def version_count(self):
        return self.files.count()


class OutputFile(models.Model):
    research_output = models.ForeignKey(
        ResearchOutput, on_delete=models.CASCADE, related_name='files'
    )
    file = models.FileField(upload_to=upload_to)
    original_filename = models.CharField(max_length=255)
    file_size = models.PositiveBigIntegerField(default=0)
    version = models.PositiveIntegerField(default=1)
    change_notes = models.TextField(blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-version']

    def __str__(self):
        return f'{self.research_output.title} v{self.version}'

    def save(self, *args, **kwargs):
        if self.file and hasattr(self.file, 'size'):
            self.file_size = self.file.size
        super().save(*args, **kwargs)


class DownloadLog(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='downloads'
    )
    research_output = models.ForeignKey(
        ResearchOutput,
        on_delete=models.CASCADE,
        related_name='download_logs'
    )
    output_file = models.ForeignKey(
        OutputFile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    downloaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-downloaded_at']

    def __str__(self):
        return f'{self.user} downloaded {self.research_output} at {self.downloaded_at}'


class Department(models.Model):
    name = models.CharField(max_length=200, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Course(models.Model):
    name = models.CharField(max_length=200)
    department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        related_name='courses',
        null=True,
        blank=True,
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(fields=['name', 'department'], name='uniq_course_department'),
        ]

    def __str__(self):
        if self.department:
            return f'{self.name} ({self.department.name})'
        return self.name


class Repository(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='repositories'
    )
    is_public = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title

    @property
    def current_version(self):
        latest = self.files.order_by('-version').first()
        return latest.version if latest else 0


class RepositoryFile(models.Model):
    repository = models.ForeignKey(
        Repository,
        on_delete=models.CASCADE,
        related_name='files',
    )
    file = models.FileField(upload_to=repository_upload_to)
    original_filename = models.CharField(max_length=255)
    file_size = models.PositiveBigIntegerField(default=0)
    version = models.PositiveIntegerField(default=1)
    change_notes = models.TextField(blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='repository_file_uploads'
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-version']

    def __str__(self):
        return f'{self.repository.title} v{self.version}'

    def save(self, *args, **kwargs):
        if self.file and hasattr(self.file, 'size'):
            self.file_size = self.file.size
        super().save(*args, **kwargs)


class ArchiveDocument(models.Model):
    title = models.CharField(max_length=500)
    abstract = models.TextField(blank=True)
    file = models.FileField(upload_to=archive_upload_to)
    original_filename = models.CharField(max_length=255)
    file_size = models.PositiveBigIntegerField(default=0)
    author = models.CharField(max_length=300, blank=True)
    department = models.CharField(max_length=200, blank=True)
    course = models.CharField(max_length=200, blank=True)
    year = models.PositiveIntegerField(null=True, blank=True)
    keywords = models.JSONField(default=list, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='archive_documents'
    )
    linked_repository = models.ForeignKey(
        Repository,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='archive_documents'
    )
    system_link = models.URLField(max_length=500, blank=True)
    assigned_faculty = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_archive_documents',
        limit_choices_to={'role': 'faculty'},
    )
    is_public = models.BooleanField(default=True)
    is_approved = models.BooleanField(default=False)
    is_rejected = models.BooleanField(default=False)
    rejection_reason = models.TextField(blank=True)
    revision_comment = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_archive_documents',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    is_deleted = models.BooleanField(default=False)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if self.file and hasattr(self.file, 'size'):
            self.file_size = self.file.size
        if self.file and not self.original_filename:
            self.original_filename = self.file.name
        super().save(*args, **kwargs)

    @property
    def current_version(self):
        latest = self.versions.order_by('-version').first()
        return latest.version if latest else 1

    @property
    def version_count(self):
        return self.versions.count()


class ArchiveDocumentVersion(models.Model):
    archive_document = models.ForeignKey(
        ArchiveDocument,
        on_delete=models.CASCADE,
        related_name='versions',
    )
    file = models.FileField(upload_to=archive_version_upload_to)
    original_filename = models.CharField(max_length=255)
    file_size = models.PositiveBigIntegerField(default=0)
    version = models.PositiveIntegerField(default=1)
    change_notes = models.TextField(blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='archive_document_version_uploads',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-version']

    def __str__(self):
        return f'{self.archive_document.title} v{self.version}'

    def save(self, *args, **kwargs):
        if self.file and hasattr(self.file, 'size'):
            self.file_size = self.file.size
        super().save(*args, **kwargs)
