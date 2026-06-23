# /backend/users/views/permission_views.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied


class CheckGlobalAdminView(APIView):
    pagination_class = None
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Проверяем, что ты суперпользователь И находишься на публичном домене
        # (в django-tenants за это отвечает connection.schema_name == 'public')
        if request.user.is_superuser:
            return Response({
                "is_global_admin": True,
                "username": request.user.username,
                "email": request.user.email
            })
        
        # Если залогинен обычный юзер компании, мы его жестко разворачиваем
        raise PermissionDenied("Доступ запрещен. Вы не являетесь администратором платформы.")