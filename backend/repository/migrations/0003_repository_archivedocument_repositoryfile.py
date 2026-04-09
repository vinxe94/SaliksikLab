from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import repository.models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('repository', '0002_researchoutput_co_authors_researchoutput_course_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='Repository',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='repositories', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='RepositoryFile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.FileField(upload_to=repository.models.repository_upload_to)),
                ('original_filename', models.CharField(max_length=255)),
                ('file_size', models.PositiveBigIntegerField(default=0)),
                ('version', models.PositiveIntegerField(default=1)),
                ('change_notes', models.TextField(blank=True)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('repository', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='files', to='repository.repository')),
                ('uploaded_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='repository_file_uploads', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-version']},
        ),
        migrations.CreateModel(
            name='ArchiveDocument',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=500)),
                ('abstract', models.TextField(blank=True)),
                ('file', models.FileField(upload_to=repository.models.archive_upload_to)),
                ('original_filename', models.CharField(max_length=255)),
                ('file_size', models.PositiveBigIntegerField(default=0)),
                ('author', models.CharField(blank=True, max_length=300)),
                ('department', models.CharField(blank=True, max_length=200)),
                ('course', models.CharField(blank=True, max_length=200)),
                ('year', models.PositiveIntegerField(blank=True, null=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('linked_repository', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='archive_documents', to='repository.repository')),
                ('uploaded_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='archive_documents', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-uploaded_at']},
        ),
    ]
