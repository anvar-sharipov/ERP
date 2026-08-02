# backend/companies/serializers/CompanySerializer.py
from rest_framework import serializers
from ..models import Company


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = "__all__"
        

class CompanyUpdateSerializer(serializers.ModelSerializer):
    """Только то, что реально можно менять у живого тенанта."""
    class Meta:
        model = Company
        fields = ["name", "is_active", "pc_lock_enabled", "allowed_computer_name", "allowed_hardware_id", "allow_branch_creation"]
        # schema_name намеренно НЕ включаем — его менять нельзя через API

    def validate(self, attrs):
        # ✅ Привязка к ПК (см. companies/middleware.py) — включать галочку без
        # обоих идентификаторов бессмысленно и опасно: middleware трактует
        # пустое поле как несовпадение и просто заблокирует компанию сразу же
        # после сохранения. Раньше это позволялось (переходный период), но
        # теперь оба поля обязательны при pc_lock_enabled=True — проверяем
        # значение ПОСЛЕ применения текущего PATCH к уже сохранённым данным,
        # а не только то, что пришло в этом запросе (PATCH может менять
        # только галочку, не трогая уже сохранённые имя/ID).
        instance = self.instance
        pc_lock_enabled = attrs.get('pc_lock_enabled', getattr(instance, 'pc_lock_enabled', False) if instance else False)
        if pc_lock_enabled:
            allowed_name = attrs.get('allowed_computer_name', getattr(instance, 'allowed_computer_name', '') if instance else '')
            allowed_hw = attrs.get('allowed_hardware_id', getattr(instance, 'allowed_hardware_id', '') if instance else '')
            if not (allowed_name or '').strip() or not (allowed_hw or '').strip():
                raise serializers.ValidationError(
                    "Для привязки к ПК нужно заполнить оба поля: имя компьютера и ID железа."
                )
        return attrs