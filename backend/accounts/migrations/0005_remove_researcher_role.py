from django.db import migrations, models


def convert_researchers_to_students(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    User.objects.filter(role='researcher').update(role='student')


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_loginevent'),
    ]

    operations = [
        migrations.RunPython(convert_researchers_to_students, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[
                    ('admin', 'Admin'),
                    ('faculty', 'Faculty'),
                    ('student', 'Student'),
                ],
                default='student',
                max_length=20,
            ),
        ),
    ]
