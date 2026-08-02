# backend/accounting/views/trip_views.py
from django.core.exceptions import ValidationError
from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from accounting.models import Trip, Document, AuditLog
from accounting.mixins import AuditMixin, BulkDestroyMixin
from accounting.serializers.trip_serializers import TripSerializer, TripListSerializer
from users.permissions import _rbac
from users.scoping import apply_scope
from .document_views import _get_error_detail


class TripViewSet(AuditMixin, BulkDestroyMixin, viewsets.ModelViewSet):
    """
    Рейсы водителей — см. accounting/models/trip.py::Trip.

    Управление составом (add-document/remove-document) и статусом
    (deliver/cancel-delivery) идёт через отдельные @action'ы, а не через
    обычный update(), т.к. это бизнес-операции со своей валидацией/аудитом
    (см. Trip.add_document/remove_document/deliver/cancel_delivery).
    """
    # ✅ Как у Warehouse/Counterparty/Employee — умеренный список, TripsListPage.tsx
    # использует клиентскую пагинацию Table.tsx и ждёт от list() голый массив, а
    # не {count, results} — с DRF-пагинацией по умолчанию фронт падал с
    # "trips.find is not a function".
    pagination_class = None

    def get_queryset(self):
        qs = Trip.objects.select_related(
            'driver', 'warehouse', 'warehouse__branch', 'delivered_by', 'created_by',
        ).prefetch_related('documents__counterparty')

        qs = apply_scope(qs, self.request.user, branch_field='warehouse__branch_id', warehouse_field='warehouse_id')

        params = self.request.query_params
        if driver := params.get('driver'):
            qs = qs.filter(driver_id=driver)
        if warehouse := params.get('warehouse'):
            qs = qs.filter(warehouse_id=warehouse)
        if status_param := params.get('status'):
            qs = qs.filter(status=status_param)
        if date_from := params.get('date_from'):
            qs = qs.filter(date__gte=date_from)
        if date_to := params.get('date_to'):
            qs = qs.filter(date__lte=date_to)
        if search := params.get('search'):
            qs = qs.filter(
                Q(driver__full_name__icontains=search) |
                Q(comment__icontains=search) |
                Q(warehouse__name__icontains=search)
            )

        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return TripListSerializer
        return TripSerializer

    def get_permissions(self):
        return _rbac(self.action, 'trip')

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        self._write_log(self.request, instance, AuditLog.Action.CREATE)

    def perform_destroy(self, instance):
        if instance.status == Trip.Status.DELIVERED:
            raise ValidationError("Нельзя удалить доставленный рейс — сначала отмените доставку.")
        if instance.documents.exists():
            raise ValidationError("Нельзя удалить рейс, пока к нему привязаны накладные — сначала уберите их из рейса.")
        super().perform_destroy(instance)

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ValidationError as e:
            return Response({'detail': _get_error_detail(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='add-document')
    def add_document(self, request, pk=None):
        trip = self.get_object()
        document_id = request.data.get('document_id')
        if not document_id:
            return Response({'detail': 'Укажите document_id.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            document = Document.objects.get(pk=document_id)
        except Document.DoesNotExist:
            return Response({'detail': 'Накладная не найдена.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            trip.add_document(document)
        except ValidationError as e:
            return Response({'detail': _get_error_detail(e)}, status=status.HTTP_400_BAD_REQUEST)
        self._write_log(request, trip, AuditLog.Action.UPDATE, {'Добавлена накладная в рейс': document.number})
        return Response(TripSerializer(trip, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='remove-document')
    def remove_document(self, request, pk=None):
        trip = self.get_object()
        document_id = request.data.get('document_id')
        try:
            document = trip.documents.get(pk=document_id)
        except (Document.DoesNotExist, ValueError, TypeError):
            return Response({'detail': 'Накладная не найдена в этом рейсе.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            trip.remove_document(document)
        except ValidationError as e:
            return Response({'detail': _get_error_detail(e)}, status=status.HTTP_400_BAD_REQUEST)
        self._write_log(request, trip, AuditLog.Action.UPDATE, {'Убрана накладная из рейса': document.number})
        return Response(TripSerializer(trip, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='deliver')
    def deliver(self, request, pk=None):
        trip = self.get_object()
        try:
            trip.deliver(user=request.user)
        except ValidationError as e:
            return Response({'detail': _get_error_detail(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(TripSerializer(trip, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='cancel-delivery')
    def cancel_delivery(self, request, pk=None):
        trip = self.get_object()
        try:
            trip.cancel_delivery(user=request.user)
        except ValidationError as e:
            return Response({'detail': _get_error_detail(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(TripSerializer(trip, context={'request': request}).data)
