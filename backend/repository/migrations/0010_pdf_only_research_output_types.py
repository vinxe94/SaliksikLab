from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('repository', '0009_archivedocument_is_public'),
    ]

    operations = [
        migrations.AlterField(
            model_name='researchoutput',
            name='output_type',
            field=models.CharField(
                choices=[
                    ('thesis', 'Thesis Manuscript'),
                    ('documentation', 'Research Documentation'),
                    ('other', 'Research PDF'),
                ],
                default='thesis',
                max_length=30,
            ),
        ),
    ]
