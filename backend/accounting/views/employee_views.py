# backend/accounting/views/employee_views.py
from rest_framework import viewsets
from django.db.models import Q

from ..models import Position, Employee, Agent
from ..serializers.employee_serializers import (
    PositionSerializer,
    EmployeeSerializer,
    AgentSerializer,
)
from accounting.mixins import AuditMixin, BulkDestroyMixin
from users.permissions import _rbac
from users.scoping import apply_scope
from users.scoping import get_user_scope


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
        qs = Employee.objects.select_related('position', 'user', 'branch')

        # Data Scoping — сотрудники фильтруются по филиалу
        # branch=null означает общий сотрудник (директор) — виден всем
        branch_ids, _ = __import__('users.scoping', fromlist=['get_user_scope']).get_user_scope(self.request.user)
        if branch_ids:
            qs = qs.filter(
                Q(branch_id__in=branch_ids) | Q(branch__isnull=True)
            )

        params = self.request.query_params

        if branch := params.get('branch'):
            qs = qs.filter(
                Q(branch_id=branch) | Q(branch__isnull=True)
            )

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
    
    def perform_create(self, serializer):
        branch_ids, _ = get_user_scope(self.request.user)

        branch = serializer.validated_data.get('branch')

        # Если у пользователя есть ограничения — нельзя создавать общего сотрудника
        if branch_ids and not branch:
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Укажите филиал сотрудника.")

        serializer.save()


class AgentViewSet(AuditMixin, BulkDestroyMixin, viewsets.ModelViewSet):
    """
    Профили агентов (Employee + район) — то, на что ссылается Counterparty.agent.
    Один Employee может иметь несколько Agent-профилей (разные районы), см.
    accounting/models/employee.py::Agent.
    """
    pagination_class = None
    serializer_class = AgentSerializer

    def get_permissions(self):
        return _rbac(self.action, 'agent')

    def get_queryset(self):
        qs = Agent.objects.select_related('employee', 'employee__user')

        params = self.request.query_params
        if employee := params.get('employee'):
            qs = qs.filter(employee_id=employee)
        if is_active := params.get('is_active'):
            qs = qs.filter(is_active=is_active.lower() == 'true')
        if search := params.get('search'):
            qs = qs.filter(
                Q(employee__full_name__icontains=search) |
                Q(district__icontains=search)
            )

        return qs.order_by('employee__full_name', 'district')
