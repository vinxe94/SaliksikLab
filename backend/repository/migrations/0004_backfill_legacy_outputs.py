from django.db import migrations


def backfill_legacy_outputs(apps, schema_editor):
    ResearchOutput = apps.get_model('repository', 'ResearchOutput')
    OutputFile = apps.get_model('repository', 'OutputFile')
    Repository = apps.get_model('repository', 'Repository')
    RepositoryFile = apps.get_model('repository', 'RepositoryFile')
    ArchiveDocument = apps.get_model('repository', 'ArchiveDocument')

    for legacy in ResearchOutput.objects.all().iterator():
        repository = Repository.objects.create(
            title=legacy.title[:255],
            description=legacy.abstract or '',
            created_by_id=legacy.uploaded_by_id,
            is_deleted=legacy.is_deleted,
        )
        Repository.objects.filter(pk=repository.pk).update(
            created_at=legacy.created_at,
            updated_at=legacy.updated_at,
        )

        legacy_files = list(
            OutputFile.objects.filter(research_output_id=legacy.pk).order_by('version', 'uploaded_at')
        )

        for legacy_file in legacy_files:
            new_file = RepositoryFile.objects.create(
                repository_id=repository.pk,
                file=legacy_file.file.name,
                original_filename=legacy_file.original_filename,
                file_size=legacy_file.file_size,
                version=legacy_file.version,
                change_notes=legacy_file.change_notes,
                uploaded_by_id=legacy_file.uploaded_by_id,
            )
            RepositoryFile.objects.filter(pk=new_file.pk).update(
                uploaded_at=legacy_file.uploaded_at,
            )

        latest_file = legacy_files[-1] if legacy_files else None
        if latest_file:
            archive = ArchiveDocument.objects.create(
                title=legacy.title,
                abstract=legacy.abstract or '',
                file=latest_file.file.name,
                original_filename=latest_file.original_filename,
                file_size=latest_file.file_size,
                author=legacy.author,
                department=legacy.department,
                course=legacy.course,
                year=legacy.year,
                uploaded_by_id=legacy.uploaded_by_id,
                linked_repository_id=repository.pk,
                is_deleted=legacy.is_deleted,
            )
            ArchiveDocument.objects.filter(pk=archive.pk).update(
                uploaded_at=legacy.created_at,
                updated_at=legacy.updated_at,
            )


class Migration(migrations.Migration):

    dependencies = [
        ('repository', '0003_repository_archivedocument_repositoryfile'),
    ]

    operations = [
        migrations.RunPython(backfill_legacy_outputs, migrations.RunPython.noop),
    ]
