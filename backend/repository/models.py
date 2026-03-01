import os
from django.db import models
from django.conf import settings


def upload_to(instance, filename):
    ext = filename.rsplit('.', 1)[-1].lower()
    return f'outputs/{instance.research_output.id}/v{instance.version}/{filename}'


class ResearchOutput(models.Model):
    TYPE_CHOICES = [
        ('thesis', 'Thesis Manuscript'),
        ('software', 'Software Project'),
        ('sourcecode', 'Source Code'),
        ('documentation', 'Documentation'),
        ('other', 'Other'),
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
