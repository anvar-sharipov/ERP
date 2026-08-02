# /backend/users/views/RBAC_views.py
from ..serializers.user_serializer import RoleSerializer
from rest_framework import generics
from ..models import Role, Permission, UserRole, User
from collections import defaultdict
from rest_framework.response import Response
from django.contrib.contenttypes.models import ContentType

from rest_framework.views import APIView
from users.permissions import _rbac
from accounting.mixins import AuditMixin
from accounting.models import AuditLog


class RoleListView(AuditMixin, generics.ListCreateAPIView):
    pagination_class = None
    serializer_class = RoleSerializer
    queryset = Role.objects.all()

    def get_permissions(self):
        action = 'list' if self.request.method == 'GET' else 'create'
        return _rbac(action, "role")

    # ✅ Дефолтный AuditMixin.perform_create залогировал бы только поля самой
    # Role (name) — RolePermission не concrete-поле Role, _snapshot() его не
    # видит. Право доступа (какие именно permissions выданы новой роли) —
    # это и есть смысл записи "создана роль", поэтому логируем явным списком.
    def perform_create(self, serializer):
        instance = serializer.save()
        perm_labels = sorted(str(p) for p in Permission.objects.filter(
            id__in=instance.rolepermission_set.values_list('permission_id', flat=True)
        ))
        self._write_log(self.request, instance, AuditLog.Action.CREATE, {
            'name': instance.name,
            'permissions': ', '.join(perm_labels) or '—',
        })


class PermissionMatrixView(APIView):
    pagination_class = None
    def get(self, request):
        # Группируем права: { "users": ["GET", "POST"...], "accounting": [...] }
        perms = Permission.objects.all()
        matrix = defaultdict(list)
        for p in perms:
            matrix[p.resource].append({"id": p.id, "action": p.action})
        return Response(matrix)


class RoleDetailView(AuditMixin, generics.RetrieveUpdateDestroyAPIView):
    pagination_class = None
    serializer_class = RoleSerializer
    queryset = Role.objects.all()

    def get_permissions(self):
        action_map = {
            'GET': 'retrieve',
            'PUT': 'update',
            'PATCH': 'update',
            'DELETE': 'destroy'
        }
        action = action_map.get(self.request.method, 'retrieve')
        return _rbac(action, "role")

    # ✅ Как и в perform_create выше — набор прав роли не виден дефолтному
    # AuditMixin._snapshot() (RolePermission — не concrete-поле Role), а именно
    # смена прав здесь и есть главное, что нужно уметь восстановить из аудита
    # (см. CLAUDE.md: changed_data должен быть явным и подробным, не "—").
    def perform_update(self, serializer):
        old_perm_ids = set(serializer.instance.rolepermission_set.values_list('permission_id', flat=True))
        old_name = serializer.instance.name
        instance = serializer.save()
        new_perm_ids = set(instance.rolepermission_set.values_list('permission_id', flat=True))

        changed_data = {}
        if old_name != instance.name:
            changed_data['name'] = {'before': old_name, 'after': instance.name}
        if old_perm_ids != new_perm_ids:
            added = Permission.objects.filter(id__in=new_perm_ids - old_perm_ids)
            removed = Permission.objects.filter(id__in=old_perm_ids - new_perm_ids)
            changed_data['permissions_added'] = ', '.join(sorted(str(p) for p in added)) or '—'
            changed_data['permissions_removed'] = ', '.join(sorted(str(p) for p in removed)) or '—'

        if changed_data:
            self._write_log(self.request, instance, AuditLog.Action.UPDATE, changed_data)

    # ✅ Снимок прав роли НА МОМЕНТ УДАЛЕНИЯ — иначе после удаления роли
    # невозможно восстановить, что именно она разрешала (RolePermission
    # каскадно удалится вместе с ней).
    def perform_destroy(self, instance):
        perm_labels = sorted(str(p) for p in Permission.objects.filter(
            id__in=instance.rolepermission_set.values_list('permission_id', flat=True)
        ))
        self._write_log(self.request, instance, AuditLog.Action.DELETE, {
            'name': instance.name,
            'permissions_at_deletion': ', '.join(perm_labels) or '—',
        })
        instance.delete()


class AssignRoleView(APIView):
    pagination_class = None


    def get_permissions(self):
        # Мы явно указываем, что это действие равно 'update' (или 'create', зависит от бизнес-логики)
        return _rbac('update', 'userrole')

    def post(self, request, user_id):
        user = User.objects.get(id=user_id)
        role_ids = request.data.get('roles', [])

        # ✅ Кастомный action (raw .delete()+.create(), не через ModelSerializer)
        # — AuditMixin здесь не помогает, пишем явный AuditLog вручную, как и
        # Document.post()/unpost() (см. CLAUDE.md: побочные эффекты в кастомных
        # actions не покрываются perform_create/update/destroy автоматически).
        old_roles = sorted(user.userrole_set.values_list('role__name', flat=True))

        user.userrole_set.all().delete()
        for role_id in role_ids:
            UserRole.objects.create(user=user, role_id=role_id)

        new_roles = sorted(Role.objects.filter(id__in=role_ids).values_list('name', flat=True))

        AuditLog.objects.create(
            content_type=ContentType.objects.get_for_model(User),
            object_id=user.id,
            object_repr=str(user)[:255],
            action=AuditLog.Action.UPDATE,
            user=request.user if request.user.is_authenticated else None,
            changed_data={
                'roles': {'before': ', '.join(old_roles) or '—', 'after': ', '.join(new_roles) or '—'},
            },
        )

        return Response({"status": "roles updated"})
