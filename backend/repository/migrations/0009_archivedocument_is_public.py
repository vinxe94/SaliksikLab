from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('repository', '0008_archivedocumentversion'),
    ]

    operations = [
        migrations.AddField(
            model_name='archivedocument',
            name='is_public',
            field=models.BooleanField(default=True),
        ),
    ]
