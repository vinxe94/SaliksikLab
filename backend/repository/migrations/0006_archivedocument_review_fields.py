from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('repository', '0005_archivedocument_system_link'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql=[
                        """
                        ALTER TABLE repository_archivedocument
                        ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false
                        """,
                        """
                        ALTER TABLE repository_archivedocument
                        ADD COLUMN IF NOT EXISTS is_rejected boolean NOT NULL DEFAULT false
                        """,
                        """
                        ALTER TABLE repository_archivedocument
                        ADD COLUMN IF NOT EXISTS rejection_reason text NOT NULL DEFAULT ''
                        """,
                    ],
                    reverse_sql=[
                        """
                        ALTER TABLE repository_archivedocument
                        DROP COLUMN IF EXISTS rejection_reason
                        """,
                        """
                        ALTER TABLE repository_archivedocument
                        DROP COLUMN IF EXISTS is_rejected
                        """,
                        """
                        ALTER TABLE repository_archivedocument
                        DROP COLUMN IF EXISTS is_approved
                        """,
                    ],
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='archivedocument',
                    name='is_approved',
                    field=models.BooleanField(default=False),
                ),
                migrations.AddField(
                    model_name='archivedocument',
                    name='is_rejected',
                    field=models.BooleanField(default=False),
                ),
                migrations.AddField(
                    model_name='archivedocument',
                    name='rejection_reason',
                    field=models.TextField(blank=True),
                ),
            ],
        ),
    ]
