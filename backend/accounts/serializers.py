from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import User, PasswordResetToken


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, label='Confirm Password')

    class Meta:
        model = User
        fields = ['email', 'first_name', 'last_name', 'role', 'department', 'password', 'password2']

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')
        return User.objects.create_user(**validated_data)


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'full_name',
                  'role', 'department', 'avatar', 'avatar_url',
                  'date_joined', 'is_active', 'is_account_approved']
        read_only_fields = ['id', 'date_joined']

    def get_full_name(self, obj):
        return obj.get_full_name()

    def get_avatar_url(self, obj):
        request = self.context.get('request')
        if not obj.avatar:
            return None
        if request is not None:
            return request.build_absolute_uri(obj.avatar.url)
        return obj.avatar.url


class UserAdminSerializer(serializers.ModelSerializer):
    """For admin user management – allows role/active/approval changes."""
    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'role',
                  'department', 'avatar', 'is_active', 'is_account_approved', 'date_joined']
        read_only_fields = ['id', 'email', 'date_joined']
