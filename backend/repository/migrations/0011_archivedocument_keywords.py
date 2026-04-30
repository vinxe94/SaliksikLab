from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('repository', '0010_pdf_only_research_output_types'),
    ]

    operations = [
        migrations.AddField(
            model_name='archivedocument',
            name='keywords',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
