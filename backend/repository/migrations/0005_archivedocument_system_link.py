from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('repository', '0004_backfill_legacy_outputs'),
    ]

    operations = [
        migrations.AddField(
            model_name='archivedocument',
            name='system_link',
            field=models.URLField(blank=True, max_length=500),
        ),
    ]
