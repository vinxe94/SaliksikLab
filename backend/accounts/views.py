from datetime import timedelta
from django.utils import timezone
from django.conf import settings as django_settings
from django.core.mail import send_mail
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User, PasswordResetToken
from .serializers import RegisterSerializer, UserSerializer, UserAdminSerializer


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user).data
        return data


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        try:
            return super().post(request, *args, **kwargs)
        except Exception as e:
            if 'account_not_approved' in str(e):
                return Response(
                    {'detail': 'Your account is pending admin approval. Please wait for an administrator to activate your account.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            raise


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)

        return Response(
            {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': UserSerializer(user, context={'request': request}).data,
            },
            status=status.HTTP_201_CREATED,
        )


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'


class AdminUserListView(generics.ListAPIView):
    queryset = User.objects.all()
    serializer_class = UserAdminSerializer
    permission_classes = [IsAdmin]
    pagination_class = None


class AdminUserDetailView(generics.RetrieveUpdateAPIView):
    queryset = User.objects.all()
    serializer_class = UserAdminSerializer
    permission_classes = [IsAdmin]


class FacultyListView(generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return User.objects.filter(
            role='faculty',
            is_active=True,
            is_account_approved=True,
        ).order_by('last_name', 'first_name')


class UserApprovalView(APIView):
    """Admin toggles is_account_approved for a user."""
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        user.is_account_approved = not user.is_account_approved
        user.save()

        if user.is_account_approved:
            try:
                send_mail(
                    subject='Your account has been approved!',
                    message=(
                        f'Hi {user.get_full_name()},\n\n'
                        f'Your account has been approved. You can now log in to the Research Repository:\n'
                        f'{getattr(django_settings, "FRONTEND_URL", "http://localhost:5173")}/login'
                    ),
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[user.email],
                    fail_silently=True,
                )
            except Exception:
                pass

        return Response({'is_account_approved': user.is_account_approved})


class PasswordResetRequestView(APIView):
    """Step 1: Submit email to get a reset link."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        # Always return 200 for security (don't reveal if email exists)
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({'detail': 'If that email exists, a reset link has been sent.'})

        # Invalidate old tokens
        PasswordResetToken.objects.filter(user=user, is_used=False).update(is_used=True)

        token = PasswordResetToken.objects.create(user=user)
        reset_url = f"{getattr(django_settings, 'FRONTEND_URL', 'http://localhost:5173')}/reset-password?token={token.token}"

        try:
            send_mail(
                subject='Password Reset — Research Repository',
                message=(
                    f'Hi {user.get_full_name()},\n\n'
                    f'Click the link below to reset your password:\n{reset_url}\n\n'
                    f'This link expires in 1 hour. If you did not request a reset, ignore this email.'
                ),
                from_email=django_settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )
        except Exception:
            pass

        return Response({'detail': 'If that email exists, a reset link has been sent.'})


class PasswordResetConfirmView(APIView):
    """Step 2: Use token + new password to complete the reset."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        token_value = request.data.get('token', '').strip()
        new_password = request.data.get('new_password', '').strip()

        if not token_value or not new_password:
            return Response(
                {'detail': 'Token and new_password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            token = PasswordResetToken.objects.get(token=token_value, is_used=False)
        except PasswordResetToken.DoesNotExist:
            return Response(
                {'detail': 'Invalid or expired reset link.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Expire after 1 hour
        if timezone.now() - token.created_at > timedelta(hours=1):
            token.is_used = True
            token.save()
            return Response(
                {'detail': 'Reset link has expired. Please request a new one.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = token.user
        user.set_password(new_password)
        user.save()

        token.is_used = True
        token.save()

        return Response({'detail': 'Password reset successful. You can now log in.'})
