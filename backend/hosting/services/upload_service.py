from django.conf import settings
from django.core.files.uploadhandler import FileUploadHandler
from rest_framework.exceptions import APIException


class UploadTooLarge(APIException):
    status_code = 413
    default_code = 'deployment_upload_too_large'


class DeploymentUploadLimitHandler(FileUploadHandler):
    """Bound all multipart file bytes before Django stores the complete request."""

    def __init__(self, request):
        super().__init__(request)
        self.received = 0

    def receive_data_chunk(self, raw_data, start):
        self.received += len(raw_data)
        if self.received > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
            # An in-progress temporary file is not yet in request.FILES. Close it
            # explicitly before propagating the DRF error from the parser.
            for handler in self.request.upload_handlers:
                file = getattr(handler, 'file', None)
                if file is not None:
                    file.close()
            raise UploadTooLarge(f'ZIP upload exceeds the {settings.MAX_UPLOAD_SIZE_MB} MB limit.')
        return raw_data

    def file_complete(self, file_size):
        return None


class LimitedHostingUpload:
    def initialize_request(self, request, *args, **kwargs):
        request.upload_handlers.insert(0, DeploymentUploadLimitHandler(request))
        return super().initialize_request(request, *args, **kwargs)
