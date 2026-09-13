from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('hosting', '0005_add_ruby_cpp_runtimes'),
    ]

    operations = [
        migrations.AlterField(
            model_name='hostingsession',
            name='project_type',
            field=models.CharField(
                choices=[
                    ('static', 'HTML / CSS / JavaScript'),
                    ('php', 'PHP'),
                    ('python', 'Python'),
                    ('node', 'Node / JavaScript'),
                    ('ruby', 'Ruby'),
                    ('cpp', 'C++'),
                    ('fullstack', 'Frontend + backend + database'),
                ],
                max_length=20,
            ),
        ),
    ]
