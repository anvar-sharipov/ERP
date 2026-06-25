# # /backend/users/views.py
# from rest_framework.views import APIView
# from rest_framework.response import Response
# from rest_framework.permissions import IsAuthenticated
# from .serializers.user_serializer import UserSerializer, RoleSerializer
# from rest_framework.exceptions import PermissionDenied
# from icecream import ic

# from rest_framework_simplejwt.views import TokenObtainPairView
# from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
# from rest_framework.exceptions import AuthenticationFailed
# from .permissions import HasPermission
# from rest_framework import generics
# from .models import User, Role