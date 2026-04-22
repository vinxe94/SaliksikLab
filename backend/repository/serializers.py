from rest_framework import serializers
from django.core.validators import URLValidator
from django.core.exceptions import ValidationError as DjangoValidationError
from accounts.serializers import UserSerializer
from .models import (
    ResearchOutput, OutputFile, DownloadLog,
    Repository, RepositoryFile, ArchiveDocument,
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

    class Meta:
        model = Repository
        fields = [
            'id', 'title', 'description', 'created_by',
            'created_at', 'updated_at', 'file_count',
            'current_version', 'linked_documents_count',
        ]

    def get_file_count(self, obj):
        return obj.files.count()

    def get_current_version(self, obj):
        return obj.current_version

    def get_linked_documents_count(self, obj):
        return obj.archive_documents.filter(is_deleted=False).count()


class ArchiveDocumentCompactSerializer(serializers.ModelSerializer):
    linked_repository_title = serializers.CharField(source='linked_repository.title', read_only=True)

    class Meta:
        model = ArchiveDocument
        fields = [
            'id', 'title', 'abstract', 'author', 'department',
            'course', 'year', 'uploaded_at', 'linked_repository',
            'linked_repository_title', 'system_link', 'original_filename',
        ]


class RepositoryDetailSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)
    files = RepositoryFileSerializer(many=True, read_only=True)
    related_documents = serializers.SerializerMethodField()

    class Meta:
        model = Repository
        fields = [
            'id', 'title', 'description', 'created_by',
            'created_at', 'updated_at', 'files', 'related_documents',
        ]

    def get_related_documents(self, obj):
        docs = obj.archive_documents.filter(is_deleted=False).order_by('-uploaded_at')[:10]
        return ArchiveDocumentCompactSerializer(docs, many=True).data


class RepositoryCreateSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True)

    class Meta:
        model = Repository
        fields = ['id', 'title', 'description', 'file']
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
        fields = ['title', 'description']


class RepositoryRevisionSerializer(serializers.Serializer):
    file = serializers.FileField()
    change_notes = serializers.CharField(required=False, default='')

    def validate_file(self, value):
        return validate_pdf_upload(value)


class ArchiveDocumentListSerializer(serializers.ModelSerializer):
    uploaded_by = UserSerializer(read_only=True)
    linked_repository = RepositoryListSerializer(read_only=True)
    file_extension = serializers.SerializerMethodField()

    class Meta:
        model = ArchiveDocument
        fields = [
            'id', 'title', 'abstract', 'author', 'department', 'course', 'year',
            'uploaded_by', 'uploaded_at', 'updated_at', 'linked_repository',
            'system_link', 'original_filename', 'file_size', 'file_extension',
        ]

    def get_file_extension(self, obj):
        if '.' not in obj.original_filename:
            return ''
        return obj.original_filename.rsplit('.', 1)[-1].lower()


class ArchiveDocumentDetailSerializer(serializers.ModelSerializer):
    uploaded_by = UserSerializer(read_only=True)
    linked_repository = RepositoryListSerializer(read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = ArchiveDocument
        fields = [
            'id', 'title', 'abstract', 'author', 'department', 'course', 'year',
            'uploaded_by', 'uploaded_at', 'updated_at', 'linked_repository',
            'system_link', 'original_filename', 'file_size', 'file_url',
        ]

    def get_file_url(self, obj):
        if obj.file:
            return obj.file.url
        return None


class ArchiveDocumentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ArchiveDocument
        fields = [
            'id', 'title', 'abstract', 'file', 'author',
            'department', 'course', 'year', 'system_link',
        ]
        read_only_fields = ['id']

    def validate_file(self, value):
        return validate_pdf_upload(value)

    def validate_system_link(self, value):
        return validate_system_link(value)

    def create(self, validated_data):
        file = validated_data.pop('file')
        user = self.context['request'].user
        return ArchiveDocument.objects.create(
            uploaded_by=user,
            file=file,
            original_filename=file.name,
            file_size=file.size,
            **validated_data,
        )


class ArchiveDocumentUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ArchiveDocument
        fields = [
            'title', 'abstract', 'file', 'author',
            'department', 'course', 'year', 'system_link',
        ]

    def validate_file(self, value):
        return validate_pdf_upload(value)

    def validate_system_link(self, value):
        return validate_system_link(value)
