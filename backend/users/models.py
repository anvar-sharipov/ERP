# backend/users/models.py
import uuid

from utils.validators import validate_image_size
from django.contrib.auth.models import AbstractUser
from django.db import connection, models
from imagekit.models import ImageSpecField
from imagekit.processors import ResizeToFill
from PIL import Image
import os




# def user_directory_path(instance, filename):
#     # Используем username, так как он уникален и доступен сразу
#     # return f'profile_pics/{instance.username}/{filename}'
#     return f'{connection.schema_name}/profile_pics/{instance.pk}/{filename}'


# ==============================================================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ПУТЕЙ ФАЙЛОВ
# ==============================================================================

def user_directory_path(instance, filename):
    # Генерируем UUID для файла
    ext = filename.split('.')[-1]
    filename = f"{uuid.uuid4()}.{ext}"
    # Используем pk, если он есть, иначе 'new_user'
    user_id = instance.pk if instance.pk else "temp"
    return f'{connection.schema_name}/profile_pics/{user_id}/{filename}'


class User(AbstractUser):
    photo = models.ImageField(upload_to=user_directory_path, null=True, blank=True, validators=[validate_image_size])
    phone = models.CharField(max_length=20, blank=True)
    position = models.CharField(max_length=100, blank=True, verbose_name="Должность")
    
    photo_thumbnail = ImageSpecField(source='photo', processors=[ResizeToFill(100, 100)], format='JPEG', options={'quality': 80})
    
    # is_deleted = models.BooleanField(default=False)
    
    def save(self, *args, **kwargs):
        # Логика удаления старого файла
        if self.pk:
            try:
                old_user = User.objects.get(pk=self.pk)
                if old_user.photo and old_user.photo != self.photo:
                    if os.path.isfile(old_user.photo.path):
                        os.remove(old_user.photo.path)
            except User.DoesNotExist:
                pass
            
        super().save(*args, **kwargs)
            
        if self.photo:
            img = Image.open(self.photo.path)
            # Если картинка слишком большая по ширине, уменьшим её до 1000px (этого хватит для всего)
            if img.width > 1000:
                img = img.resize((1000, int(img.height * (1000 / img.width))), Image.Resampling.LANCZOS)
            
            # Сжимаем качество, чтобы файл весил мало, но выглядел хорошо
            img.save(self.photo.path, optimize=True, quality=85)

    def __str__(self):
        return f"{self.username} ({self.email})"
    
    
class Role(models.Model):
    name = models.CharField(max_length=50, unique=True)

    def __str__(self):
        return self.name


class Permission(models.Model):
    resource = models.CharField(max_length=50)   # например: "products"
    action = models.CharField(max_length=30)     # GET, POST, PUT, DELETE

    def __str__(self):
        return f"{self.resource}:{self.action}"
    
    class Meta:
        unique_together = ("resource", "action")


class RolePermission(models.Model):
    role = models.ForeignKey(Role, on_delete=models.CASCADE)
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE)

    def __str__(self):
        return f"{self.role} -> {self.permission}"
    
    class Meta:
        unique_together = ("role", "permission")


class UserRole(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    role = models.ForeignKey(Role, on_delete=models.CASCADE)

    def __str__(self):
        return f"{self.user} -> {self.role}"
    
    class Meta:
        unique_together = ("user", "role")
        
   
   
        
