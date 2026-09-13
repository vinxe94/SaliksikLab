from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('repository', '0011_archivedocument_keywords'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='archivedocument',
            name='is_public',
        ),
    ]
