from rest_framework import serializers
import os
from django.db import models
from django.core.validators import URLValidator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from accounts.serializers import UserSerializer
from .models import (
    ResearchOutput, OutputFile, DownloadLog,
    Repository, RepositoryFile, ArchiveDocument, ArchiveDocumentVersion,
    ResearchSubmissionRequest, Department, Course,
)


def validate_pdf_upload(value):
    ext = value.name.rsplit('.', 1)[-1].lower() if '.' in value.name else ''
    if ext != 'pdf':
        raise serializers.ValidationError('Only PDF files are allowed.')
    position = value.tell() if hasattr(value, 'tell') else None
    header = value.read(5)
    if position is not None and hasattr(value, 'seek'):
        value.seek(position)
    if header != b'%PDF-':
        raise serializers.ValidationError('Only valid PDF files are allowed.')
    if value.size > 104857600:
        raise serializers.ValidationError('File size cannot exceed 100 MB.')
    return value


def validate_system_upload(value):
    ext = value.name.rsplit('.', 1)[-1].lower() if '.' in value.name else ''
    if ext != 'zip':
        raise serializers.ValidationError('Executable systems must be uploaded as a ZIP package.')
    position = value.tell() if hasattr(value, 'tell') else None
    header = value.read(4)
    if position is not None and hasattr(value, 'seek'):
        value.seek(position)
    if header not in (b'PK\x03\x04', b'PK\x05\x06', b'PK\x07\x08'):
        raise serializers.ValidationError('Only valid ZIP packages are allowed.')
    if value.size > 104857600:
        raise serializers.ValidationError('File size cannot exceed 100 MB.')
    # Review packages must meet the same ZIP safety rules as hosting uploads.
    from hosting.services.archive_service import validate_zip
    from hosting.services.errors import HostingError
    try:
        value.seek(0)
        validate_zip(value)
    except HostingError as exc:
        raise serializers.ValidationError(str(exc)) from exc
    finally:
        value.seek(position or 0)
    return value


def validate_system_link(value):
    if not value:
        return value
    if not value.startswith(('http://', 'https://')):
        raise serializers.ValidationError('System link must start with http:// or https://.')
    validator = URLValidator(schemes=['http', 'https'])
    try:
        validator(value)
    except DjangoValidationError:
        raise serializers.ValidationError('Enter a valid system link.')
    return value


def normalize_keywords(value):
    if not value:
        return []
    if isinstance(value, str):
        parts = value.split(',')
    else:
        parts = value
    return [str(item).strip() for item in parts if str(item).strip()]


class OutputFileSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = OutputFile
        fields = ['id', 'original_filename', 'file_size', 'version',
                  'change_notes', 'uploaded_by', 'uploaded_by_name',
                  'uploaded_at', 'file_url']
        read_only_fields = [
            'id', 'original_filename', 'file_size', 'version',
            'change_notes', 'uploaded_by', 'uploaded_by_name',
            'uploaded_at', 'file_url',
        ]

    def get_file_url(self, obj):
        if obj.file:
            return obj.file.url
        return None

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return obj.uploaded_by.get_full_name() or obj.uploaded_by.email
        return None


class ResearchOutputListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for legacy list views."""
    uploaded_by = UserSerializer(read_only=True)
    file_count = serializers.SerializerMethodField()
    current_version = serializers.SerializerMethodField()

    class Meta:
        model = ResearchOutput
        fields = ['id', 'title', 'output_type', 'department', 'course', 'year', 'keywords',
                  'author', 'adviser', 'co_authors', 'is_approved', 'is_rejected',
                  'created_at', 'uploaded_by', 'file_count', 'current_version']

    def get_file_count(self, obj):
        return obj.files.count()

    def get_current_version(self, obj):
        f = obj.files.order_by('-version').first()
        return f.version if f else 0


class ResearchOutputDetailSerializer(serializers.ModelSerializer):
    """Legacy serializer including file versions."""
    uploaded_by = UserSerializer(read_only=True)
    files = OutputFileSerializer(many=True, read_only=True)
    download_count = serializers.SerializerMethodField()

    class Meta:
        model = ResearchOutput
        fields = ['id', 'title', 'abstract', 'output_type', 'department', 'course', 'year',
                  'keywords', 'author', 'adviser', 'co_authors', 'is_approved', 'is_rejected',
                  'rejection_reason', 'is_deleted', 'created_at', 'updated_at',
                  'uploaded_by', 'files', 'download_count']
        read_only_fields = ['id', 'created_at', 'updated_at', 'uploaded_by', 'is_deleted']

    def get_download_count(self, obj):
        return obj.download_logs.count()


class ResearchOutputCreateSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True)
    keywords = serializers.ListField(
        child=serializers.CharField(max_length=100),
        required=False, default=list
    )

    class Meta:
        model = ResearchOutput
        fields = ['title', 'abstract', 'output_type', 'department', 'course', 'year',
                  'keywords', 'author', 'adviser', 'co_authors', 'file']

    def validate_file(self, value):
        return validate_pdf_upload(value)

    def create(self, validated_data):
        file = validated_data.pop('file')
        user = self.context['request'].user
        output = ResearchOutput.objects.create(uploaded_by=user, **validated_data)
        OutputFile.objects.create(
            research_output=output,
            file=file,
            original_filename=file.name,
            file_size=file.size,
            version=1,
            uploaded_by=user,
        )
        return output


class RevisionSerializer(serializers.Serializer):
    file = serializers.FileField()
    change_notes = serializers.CharField(required=False, default='')
    title = serializers.CharField(required=False, allow_blank=True)
    abstract = serializers.CharField(required=False, allow_blank=True)
    author = serializers.CharField(required=False, allow_blank=True)
    adviser = serializers.CharField(required=False, allow_blank=True)
    department = serializers.CharField(required=False, allow_blank=True)
    course = serializers.CharField(required=False, allow_blank=True)
    keywords = serializers.ListField(
        child=serializers.CharField(max_length=100),
        required=False,
    )
    co_authors = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
    )

    def validate_file(self, value):
        return validate_pdf_upload(value)


class RepositoryFileSerializer(serializers.ModelSerializer):
    uploaded_by = UserSerializer(read_only=True)

    class Meta:
        model = RepositoryFile
        fields = [
            'id', 'original_filename', 'file_size', 'version',
            'change_notes', 'uploaded_by', 'uploaded_at',
        ]


class RepositoryListSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)
    file_count = serializers.SerializerMethodField()
    current_version = serializers.SerializerMethodField()
    linked_documents_count = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = Repository
        fields = [
            'id', 'title', 'description', 'created_by', 'is_public', 'status',
            'created_at', 'updated_at', 'file_count',
            'current_version', 'linked_documents_count',
        ]

    def get_file_count(self, obj):
        return obj.files.count()

    def get_current_version(self, obj):
        return obj.current_version

    def get_linked_documents_count(self, obj):
        return obj.archive_documents.filter(is_deleted=False).count()

    def get_status(self, obj):
        return 'public' if obj.is_public else 'private'


class ArchiveDocumentCompactSerializer(serializers.ModelSerializer):
    linked_repository_title = serializers.CharField(source='linked_repository.title', read_only=True)

    class Meta:
        model = ArchiveDocument
        fields = [
            'id', 'title', 'abstract', 'author', 'department',
            'course', 'year', 'keywords', 'uploaded_at', 'linked_repository',
            'linked_repository_title', 'system_link', 'original_filename',
        ]


class RepositoryDetailSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)
    files = RepositoryFileSerializer(many=True, read_only=True)
    related_documents = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = Repository
        fields = [
            'id', 'title', 'description', 'created_by', 'is_public', 'status',
            'created_at', 'updated_at', 'files', 'related_documents',
        ]

    def get_related_documents(self, obj):
        docs = obj.archive_documents.filter(is_deleted=False)
        request = self.context.get('request')
        if request and request.user.role != 'admin':
            docs = docs.filter(is_approved=True)
        return ArchiveDocumentCompactSerializer(docs.order_by('-uploaded_at')[:10], many=True).data

    def get_status(self, obj):
        return 'public' if obj.is_public else 'private'


class RepositoryCreateSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True)

    class Meta:
        model = Repository
        fields = ['id', 'title', 'description', 'is_public', 'file']
        read_only_fields = ['id']

    def validate_file(self, value):
        return validate_pdf_upload(value)

    def create(self, validated_data):
        file = validated_data.pop('file')
        user = self.context['request'].user
        repository = Repository.objects.create(created_by=user, **validated_data)
        RepositoryFile.objects.create(
            repository=repository,
            file=file,
            original_filename=file.name,
            file_size=file.size,
            version=1,
            uploaded_by=user,
        )
        return repository


class RepositoryUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Repository
        fields = ['title', 'description', 'is_public']


class RepositoryRevisionSerializer(serializers.Serializer):
    file = serializers.FileField()
    change_notes = serializers.CharField(required=False, default='')

    def validate_file(self, value):
        return validate_pdf_upload(value)


class ArchiveDocumentListSerializer(serializers.ModelSerializer):
    uploaded_by = UserSerializer(read_only=True)
    linked_repository = RepositoryListSerializer(read_only=True)
    assigned_faculty = UserSerializer(read_only=True)
    file_extension = serializers.SerializerMethodField()
    review_status = serializers.SerializerMethodField()
    current_version = serializers.SerializerMethodField()
    version_count = serializers.SerializerMethodField()
    source_request_id = serializers.IntegerField(source='source_submission_request.id', read_only=True)
    requested_by = UserSerializer(source='source_submission_request.requested_by', read_only=True)

    class Meta:
        model = ArchiveDocument
        fields = [
            'id', 'title', 'abstract', 'author', 'department', 'course', 'year', 'keywords',
            'uploaded_by', 'uploaded_at', 'updated_at', 'linked_repository',
            'system_link', 'original_filename', 'file_size', 'file_extension',
            'assigned_faculty', 'is_approved', 'is_rejected', 'rejection_reason',
            'revision_comment', 'review_status', 'current_version', 'version_count',
            'system_original_filename', 'system_file_size', 'source_request_id', 'requested_by',
        ]

    def get_file_extension(self, obj):
        if '.' not in obj.original_filename:
            return ''
        return obj.original_filename.rsplit('.', 1)[-1].lower()

    def get_review_status(self, obj):
        if obj.is_approved:
            return 'approved'
        if obj.is_rejected and obj.revision_comment and not obj.rejection_reason:
            return 'revision_requested'
        if obj.is_rejected:
            return 'rejected'
        return 'pending'

    def get_current_version(self, obj):
        return obj.current_version

    def get_version_count(self, obj):
        return obj.version_count


class ArchiveDocumentVersionSerializer(serializers.ModelSerializer):
    uploaded_by = UserSerializer(read_only=True)

    class Meta:
        model = ArchiveDocumentVersion
        fields = [
            'id', 'original_filename', 'file_size', 'version',
            'change_notes', 'uploaded_by', 'uploaded_at',
        ]


class ArchiveDocumentDetailSerializer(serializers.ModelSerializer):
    uploaded_by = UserSerializer(read_only=True)
    linked_repository = RepositoryListSerializer(read_only=True)
    assigned_faculty = UserSerializer(read_only=True)
    reviewed_by = UserSerializer(read_only=True)
    file_url = serializers.SerializerMethodField()
    review_status = serializers.SerializerMethodField()
    current_version = serializers.SerializerMethodField()
    version_count = serializers.SerializerMethodField()
    system_file_url = serializers.SerializerMethodField()
    source_request_id = serializers.IntegerField(source='source_submission_request.id', read_only=True)
    requested_by = UserSerializer(source='source_submission_request.requested_by', read_only=True)

    class Meta:
        model = ArchiveDocument
        fields = [
            'id', 'title', 'abstract', 'author', 'department', 'course', 'year', 'keywords',
            'uploaded_by', 'uploaded_at', 'updated_at', 'linked_repository',
            'system_link', 'original_filename', 'file_size', 'file_url',
            'assigned_faculty', 'is_approved', 'is_rejected', 'rejection_reason',
            'revision_comment', 'reviewed_by', 'reviewed_at', 'review_status',
            'current_version', 'version_count',
            'system_original_filename', 'system_file_size', 'system_file_url',
            'source_request_id', 'requested_by',
        ]

    def get_file_url(self, obj):
        if obj.file:
            return obj.file.url
        return None

    def get_system_file_url(self, obj):
        if obj.system_file:
            return obj.system_file.url
        return None

    def get_review_status(self, obj):
        if obj.is_approved:
            return 'approved'
        if obj.is_rejected and obj.revision_comment and not obj.rejection_reason:
            return 'revision_requested'
        if obj.is_rejected:
            return 'rejected'
        return 'pending'

    def get_current_version(self, obj):
        return obj.current_version

    def get_version_count(self, obj):
        return obj.version_count


class ArchiveDocumentCreateSerializer(serializers.ModelSerializer):
    keywords = serializers.ListField(
        child=serializers.CharField(max_length=100),
        required=False,
        default=list,
    )

    class Meta:
        model = ArchiveDocument
        fields = [
            'id', 'title', 'abstract', 'file', 'system_file', 'author',
            'department', 'course', 'year', 'keywords', 'system_link', 'assigned_faculty',
        ]
        read_only_fields = ['id']
        extra_kwargs = {
            'file': {'required': False, 'allow_empty_file': False},
            'system_file': {'required': False, 'allow_empty_file': False},
            'assigned_faculty': {'required': False, 'allow_null': True},
        }

    def validate_file(self, value):
        return validate_pdf_upload(value)

    def validate_system_file(self, value):
        return validate_system_upload(value)

    def validate_system_link(self, value):
        return validate_system_link(value)

    def validate_assigned_faculty(self, value):
        if value and value.role != 'faculty':
            raise serializers.ValidationError('Assigned faculty must have the faculty role.')
        if value and not value.is_active:
            raise serializers.ValidationError('Assigned faculty must be active.')
        return value

    def validate_keywords(self, value):
        return normalize_keywords(value)

    def validate(self, attrs):
        if not attrs.get('file') and not attrs.get('system_file'):
            raise serializers.ValidationError('Upload a research PDF, an executable system ZIP, or both.')
        return attrs

    def create(self, validated_data):
        file = validated_data.pop('file', None)
        system_file = validated_data.pop('system_file', None)
        user = self.context['request'].user
        doc = ArchiveDocument.objects.create(
            uploaded_by=user,
            file=file or '',
            original_filename=file.name if file else '',
            file_size=file.size if file else 0,
            system_file=system_file or '',
            system_original_filename=system_file.name if system_file else '',
            system_file_size=system_file.size if system_file else 0,
            is_approved=True,
            reviewed_by=user,
            reviewed_at=timezone.now(),
            **validated_data,
        )
        if file:
            ArchiveDocumentVersion.objects.create(
                archive_document=doc,
                file=doc.file.name,
                original_filename=file.name,
                file_size=doc.file_size,
                version=1,
                change_notes='Initial administrator upload',
                uploaded_by=user,
            )
        return doc


class ArchiveDocumentUpdateSerializer(serializers.ModelSerializer):
    keywords = serializers.ListField(
        child=serializers.CharField(max_length=100),
        required=False,
    )

    class Meta:
        model = ArchiveDocument
        fields = [
            'title', 'abstract', 'file', 'system_file', 'author',
            'department', 'course', 'year', 'keywords', 'system_link', 'assigned_faculty',
        ]

    def validate_file(self, value):
        return validate_pdf_upload(value)

    def validate_system_file(self, value):
        return validate_system_upload(value)

    def validate_system_link(self, value):
        return validate_system_link(value)

    def validate_assigned_faculty(self, value):
        if value and value.role != 'faculty':
            raise serializers.ValidationError('Assigned faculty must have the faculty role.')
        if value and not value.is_active:
            raise serializers.ValidationError('Assigned faculty must be active.')
        return value

    def validate_keywords(self, value):
        return normalize_keywords(value)


class ArchiveDocumentRevisionSerializer(serializers.Serializer):
    file = serializers.FileField()
    change_notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_file(self, value):
        return validate_pdf_upload(value)


class ArchiveDocumentReviewSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['approve', 'reject', 'revision'])
    comment = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        action = attrs['action']
        comment = attrs.get('comment', '').strip()
        if action in ['reject', 'revision'] and not comment:
            raise serializers.ValidationError({'comment': 'A comment is required for rejection or revision.'})
        attrs['comment'] = comment
        return attrs


class ResearchSubmissionRequestSerializer(serializers.ModelSerializer):
    requested_by = UserSerializer(read_only=True)
    reviewed_by = UserSerializer(read_only=True)
    queue_position = serializers.SerializerMethodField()
    published_archive_id = serializers.IntegerField(read_only=True)
    has_research_file = serializers.SerializerMethodField()
    has_system_file = serializers.SerializerMethodField()

    class Meta:
        model = ResearchSubmissionRequest
        fields = [
            'id', 'title', 'abstract', 'submission_type', 'author', 'department',
            'course', 'year', 'keywords', 'system_details', 'proposed_system_link',
            'requested_by', 'status', 'admin_comment', 'reviewed_by', 'reviewed_at',
            'published_archive_id', 'queue_position', 'queued_at', 'created_at', 'updated_at',
            'research_file', 'research_original_filename', 'research_file_size', 'has_research_file',
            'system_file', 'system_original_filename', 'system_file_size', 'has_system_file',
        ]
        read_only_fields = [
            'id', 'requested_by', 'status', 'admin_comment', 'reviewed_by',
            'reviewed_at', 'published_archive_id', 'queue_position', 'queued_at',
            'created_at', 'updated_at',
            'research_original_filename', 'research_file_size', 'has_research_file',
            'system_original_filename', 'system_file_size', 'has_system_file',
        ]
        extra_kwargs = {
            'research_file': {'write_only': True, 'required': False, 'allow_empty_file': False},
            'system_file': {'write_only': True, 'required': False, 'allow_empty_file': False},
        }

    def get_has_research_file(self, obj):
        return bool(obj.research_file)

    def get_has_system_file(self, obj):
        return bool(obj.system_file)

    def validate_research_file(self, value):
        return validate_pdf_upload(value)

    def validate_system_file(self, value):
        return validate_system_upload(value)

    def validate_keywords(self, value):
        return normalize_keywords(value)

    def validate_proposed_system_link(self, value):
        return validate_system_link(value)

    def validate(self, attrs):
        submission_type = attrs.get(
            'submission_type',
            getattr(self.instance, 'submission_type', ResearchSubmissionRequest.TYPE_RESEARCH_PAPER),
        )
        if submission_type in (
            ResearchSubmissionRequest.TYPE_EXECUTABLE_SYSTEM,
            ResearchSubmissionRequest.TYPE_PAPER_AND_SYSTEM,
        ) and not attrs.get('system_details', getattr(self.instance, 'system_details', '')).strip():
            raise serializers.ValidationError({
                'system_details': 'Describe the system, its technology stack, and how to run the uploaded package.'
            })
        needs_paper = submission_type != ResearchSubmissionRequest.TYPE_EXECUTABLE_SYSTEM
        needs_system = submission_type != ResearchSubmissionRequest.TYPE_RESEARCH_PAPER
        for field, required in (('research_file', needs_paper), ('system_file', needs_system)):
            attachment = attrs.get(field, getattr(self.instance, field, None))
            if required and not attachment:
                label = 'research PDF' if field == 'research_file' else 'system ZIP'
                raise serializers.ValidationError({field: f'Upload the {label} for administrator review.'})
            if not required and attachment:
                raise serializers.ValidationError({field: 'Select the submission type that includes this attachment.'})
            if field in attrs:
                prefix = field.removesuffix('_file')
                attrs[f'{prefix}_original_filename'] = os.path.basename(attrs[field].name)
                attrs[f'{prefix}_file_size'] = attrs[field].size
        return attrs

    def get_queue_position(self, obj):
        if obj.status != ResearchSubmissionRequest.STATUS_PENDING:
            return None
        return ResearchSubmissionRequest.objects.filter(
            models.Q(queued_at__lt=obj.queued_at) |
            models.Q(queued_at=obj.queued_at, id__lte=obj.id),
            status=ResearchSubmissionRequest.STATUS_PENDING,
        ).count()


class ResearchSubmissionRequestReviewSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['approve', 'reject', 'revision'])
    comment = serializers.CharField(required=False, allow_blank=True, default='')
    research_file = serializers.FileField(required=False, allow_empty_file=False, write_only=True)
    system_file = serializers.FileField(required=False, allow_empty_file=False, write_only=True)
    system_link = serializers.URLField(required=False, allow_blank=True, max_length=500)

    def validate_research_file(self, value):
        return validate_pdf_upload(value)

    def validate_system_file(self, value):
        return validate_system_upload(value)

    def validate_system_link(self, value):
        return validate_system_link(value)

    def validate(self, attrs):
        action = attrs['action']
        comment = attrs.get('comment', '').strip()
        submission = self.context['submission']

        if action in ('reject', 'revision') and not comment:
            raise serializers.ValidationError({'comment': 'A comment is required for rejection or revision.'})
        if action == 'approve':
            # Existing student files are the artifacts being reviewed. Legacy
            # metadata-only requests can still be completed by an administrator.
            for field in ('research_file', 'system_file'):
                if getattr(submission, field) and attrs.get(field):
                    raise serializers.ValidationError({field: 'This request already has a submitted file. Return it for revision to replace the attachment.'})
            if submission.submission_type in (
                ResearchSubmissionRequest.TYPE_RESEARCH_PAPER,
                ResearchSubmissionRequest.TYPE_PAPER_AND_SYSTEM,
            ) and not (attrs.get('research_file') or submission.research_file):
                raise serializers.ValidationError({'research_file': 'A research PDF is required to approve this request.'})
            if submission.submission_type in (
                ResearchSubmissionRequest.TYPE_EXECUTABLE_SYSTEM,
                ResearchSubmissionRequest.TYPE_PAPER_AND_SYSTEM,
            ) and not (attrs.get('system_file') or submission.system_file):
                raise serializers.ValidationError({'system_file': 'An executable system ZIP is required to approve this request.'})
        attrs['comment'] = comment
        return attrs


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'name', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class CourseSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model = Course
        fields = ['id', 'name', 'department', 'department_name', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'department_name', 'created_at', 'updated_at']
