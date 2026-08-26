# Generated manually for the temporary hosting feature.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='HostingSession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=180)),
                ('project_type', models.CharField(choices=[('static', 'HTML / CSS / JavaScript'), ('php', 'PHP'), ('python', 'Python'), ('node', 'Node / JavaScript')], max_length=20)),
                ('status', models.CharField(choices=[('starting', 'Starting'), ('running', 'Running'), ('stopped', 'Stopped'), ('failed', 'Failed'), ('expired', 'Expired'), ('killed', 'Killed')], default='starting', max_length=20)),
                ('port', models.PositiveIntegerField(blank=True, null=True)),
                ('pid', models.PositiveIntegerField(blank=True, null=True)),
                ('project_dir', models.CharField(max_length=500)),
                ('entrypoint', models.CharField(blank=True, max_length=260)),
                ('start_command', models.CharField(blank=True, max_length=500)),
                ('log_file', models.CharField(blank=True, max_length=500)),
                ('error_message', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('started_at', models.DateTimeField(blank=True, null=True)),
                ('expires_at', models.DateTimeField(blank=True, null=True)),
                ('stopped_at', models.DateTimeField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('started_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='hosting_sessions', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
                'indexes': [models.Index(fields=['status'], name='hosting_hos_status_7492f1_idx'), models.Index(fields=['expires_at'], name='hosting_hos_expires_b8ecf1_idx')],
            },
        ),
    ]
