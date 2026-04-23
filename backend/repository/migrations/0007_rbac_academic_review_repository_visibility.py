from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('repository', '0006_archivedocument_review_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='Department',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200, unique=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.AddField(
            model_name='repository',
            name='is_public',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='archivedocument',
            name='assigned_faculty',
            field=models.ForeignKey(blank=True, limit_choices_to={'role': 'faculty'}, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assigned_archive_documents', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='archivedocument',
            name='reviewed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='archivedocument',
            name='reviewed_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reviewed_archive_documents', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='archivedocument',
            name='revision_comment',
            field=models.TextField(blank=True),
        ),
        migrations.CreateModel(
            name='Course',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('department', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='courses', to='repository.department')),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.AddConstraint(
            model_name='course',
            constraint=models.UniqueConstraint(fields=('name', 'department'), name='uniq_course_department'),
        ),
    ]
