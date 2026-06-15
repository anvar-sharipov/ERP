# backend/utils/validattors/

import os
from django.core.exceptions import ValidationError
from PIL import Image


def validate_image_size(value):
    # 1. Проверка размера (макс 2 МБ)
    limit = 2 * 1024 * 1024
    if value.size > limit:
        raise ValidationError('Файл слишком большой. Максимальный размер 2 МБ.')

    # 2. Проверка содержимого (безопасность)
    try:
        # Открываем файл для проверки структуры
        img = Image.open(value)
        img.verify()  # Проверяет, является ли файл корректным изображением
        
        # Опционально: проверка формата (чтобы не грузили специфические типы)
        valid_formats = ['JPEG', 'PNG', 'WEBP']
        if img.format not in valid_formats:
             raise ValidationError(f'Неподдерживаемый формат: {img.format}.')
             
    except Exception:
        # Если Pillow не смог открыть файл как изображение - это не картинка
        raise ValidationError('Файл не является корректным изображением.')
    
    # Важный момент: после img.verify() файловый курсор нужно вернуть в начало,
    # чтобы Django мог сохранить файл на диск
    value.seek(0)