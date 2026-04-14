from django.db import migrations


def ensure_archive_status_columns(apps, schema_editor):
    ArchiveDocument = apps.get_model('repository', 'ArchiveDocument')
    table_name = ArchiveDocument._meta.db_table
    connection = schema_editor.connection
    quote = schema_editor.quote_name

    with connection.cursor() as cursor:
        columns = {
            col.name
            for col in connection.introspection.get_table_description(cursor, table_name)
        }

    if 'is_approved' not in columns:
        schema_editor.execute(
            f'ALTER TABLE {quote(table_name)} '
            f'ADD COLUMN {quote("is_approved")} boolean NOT NULL DEFAULT false'
        )

    if 'is_rejected' not in columns:
        schema_editor.execute(
            f'ALTER TABLE {quote(table_name)} '
            f'ADD COLUMN {quote("is_rejected")} boolean NOT NULL DEFAULT false'
        )

    if 'rejection_reason' not in columns:
        schema_editor.execute(
            f'ALTER TABLE {quote(table_name)} '
            f'ADD COLUMN {quote("rejection_reason")} text NOT NULL DEFAULT \'\''
        )


class Migration(migrations.Migration):
    dependencies = [
        ('repository', '0005_archivedocument_status_fields'),
    ]

    operations = [
        migrations.RunPython(ensure_archive_status_columns, migrations.RunPython.noop),
    ]
