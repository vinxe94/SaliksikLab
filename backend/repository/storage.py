"""Student attachments are served only by authenticated review endpoints."""
import os

from django.conf import settings
from django.core.files.storage import FileSystemStorage


class SubmissionStorage(FileSystemStorage):
    @property
    def base_location(self):
        return settings.SUBMISSION_STORAGE_PATH

    @property
    def location(self):
        return os.path.abspath(self.base_location)

    def url(self, name):
        raise ValueError('Submission attachments require authenticated access.')
