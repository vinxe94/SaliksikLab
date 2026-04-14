from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('repository', '0004_backfill_legacy_outputs'),
    ]

    operations = [
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
    ]
