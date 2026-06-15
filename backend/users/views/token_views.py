# /backend/users/views/token_views.py
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework.exceptions import AuthenticationFailed


class SuperuserTokenSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        # Стандартная валидация логина/пароля через SimpleJWT
        data = super().validate(attrs)
        
        # Проверяем, является ли пользователь суперадмином
        if not self.user.is_superuser:
            raise AuthenticationFailed("Доступ запрещен. Вы не являетесь глобальным администратором.")
            
        return data


class SuperuserTokenObtainView(TokenObtainPairView):
    """Эндпоинт для авторизации исключительно Глобального Суперадминистратора"""
    serializer_class = SuperuserTokenSerializer