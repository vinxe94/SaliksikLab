from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('repository', '0011_archivedocument_keywords'),
        ('hosting', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='hostingsession',
            name='archive_document',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='hosting_sessions',
                to='repository.archivedocument',
            ),
        ),
        migrations.AddIndex(
            model_name='hostingsession',
            index=models.Index(fields=['archive_document'], name='hosting_hos_archive_7f3bf5_idx'),
        ),
    ]
