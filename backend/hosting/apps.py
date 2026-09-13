from django.apps import AppConfig


class HostingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'hosting'

    # A dedicated hosting_worker owns Docker and reconciliation. AppConfig.ready
    # also runs during migrations and in every web process; it must not spawn jobs.
