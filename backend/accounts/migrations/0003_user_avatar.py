from django.db import migrations, models
import accounts.models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_user_is_account_approved_passwordresettoken'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='avatar',
            field=models.ImageField(blank=True, null=True, upload_to=accounts.models.avatar_upload_to),
        ),
    ]
