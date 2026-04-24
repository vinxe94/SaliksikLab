from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import repository.models


def backfill_archive_versions(apps, schema_editor):
    ArchiveDocument = apps.get_model('repository', 'ArchiveDocument')
    ArchiveDocumentVersion = apps.get_model('repository', 'ArchiveDocumentVersion')
    for doc in ArchiveDocument.objects.exclude(file=''):
        if ArchiveDocumentVersion.objects.filter(archive_document_id=doc.id).exists():
            continue
        ArchiveDocumentVersion.objects.create(
            archive_document_id=doc.id,
            file=doc.file,
            original_filename=doc.original_filename or doc.file.name,
            file_size=doc.file_size or 0,
            version=1,
            uploaded_by_id=doc.uploaded_by_id,
            change_notes='Initial upload',
        )


class Migration(migrations.Migration):

    dependencies = [
        ('repository', '0007_rbac_academic_review_repository_visibility'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ArchiveDocumentVersion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.FileField(upload_to=repository.models.archive_version_upload_to)),
                ('original_filename', models.CharField(max_length=255)),
                ('file_size', models.PositiveBigIntegerField(default=0)),
                ('version', models.PositiveIntegerField(default=1)),
                ('change_notes', models.TextField(blank=True)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('archive_document', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='versions', to='repository.archivedocument')),
                ('uploaded_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='archive_document_version_uploads', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-version']},
        ),
        migrations.RunPython(backfill_archive_versions, migrations.RunPython.noop),
    ]
