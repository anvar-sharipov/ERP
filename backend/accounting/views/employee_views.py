# backend/accounting/views/employee_views.py
from rest_framework import viewsets
from django.db.models import Q

from ..models import Position, Employee
from ..serializers.employee_serializers import (
    PositionSerializer,
    EmployeeSerializer,
)
from accounting.mixins import AuditMixin
from users.permissions import _rbac




class PositionViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    serializer_class = PositionSerializer

    def get_permissions(self):
        return _rbac(self.action, 'position')

    def get_queryset(self):
        qs = Position.objects.all()

        params = self.request.query_params

        if is_active := params.get('is_active'):
            qs = qs.filter(is_active=is_active.lower() == 'true')

        if search := params.get('search'):
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(description__icontains=search)
            )

        return qs.order_by('name')
    
    
    
    
class EmployeeViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    serializer_class = EmployeeSerializer

    def get_permissions(self):
        return _rbac(self.action, 'employee')

    def get_queryset(self):
        qs = (
            Employee.objects
            .select_related('position', 'user')
        )

        params = self.request.query_params

        if position := params.get('position'):
            qs = qs.filter(position_id=position)

        if user := params.get('user'):
            qs = qs.filter(user_id=user)

        if is_active := params.get('is_active'):
            qs = qs.filter(is_active=is_active.lower() == 'true')

        if search := params.get('search'):
            qs = qs.filter(
                Q(employee_no__icontains=search) |
                Q(full_name__icontains=search) |
                Q(phone__icontains=search) |
                Q(note__icontains=search) |
                Q(position__name__icontains=search)
            )

        return qs.order_by('full_name')