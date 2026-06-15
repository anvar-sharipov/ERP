from pathlib import Path
from datetime import timedelta
import os

# Загружаем переменные из .env файла в окружение
from dotenv import load_dotenv
load_dotenv()

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
# SECRET_KEY = 'django-insecure-xtc^u6+kjs5#@ny%c&n0pd)ggu0t+9(nuj-06mnm86q66!7!=-'
# print(os.environ)
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')

# SECURITY WARNING: don't run with debug turned on in production!
# DEBUG = True
DEBUG = os.environ.get('DEBUG', 'True') == 'True'

# ALLOWED_HOSTS = ['.localhost', '127.0.0.1', 'localhost']
ALLOWED_HOSTS = [
    '.localhost', 
    '127.0.0.1', 
    'localhost', 
    'backend', # Имя контейнера внутри сети Docker
    os.environ.get('PROJECT_DOMAIN', '') # Сюда прилетит наш 192.168.x.x.nip.io
]

project_domain = os.environ.get('PROJECT_DOMAIN', '')
if project_domain:
    # Добавляем сам домен (192.168.25.74.nip.io)
    ALLOWED_HOSTS.append(project_domain)
    # Добавляем его поддомены (.192.168.25.74.nip.io)
    ALLOWED_HOSTS.append(f".{project_domain}")
    
# Убираем пустые строки, если PROJECT_DOMAIN не задан
ALLOWED_HOSTS = [host for host in ALLOWED_HOSTS if host]


# Application definition

# INSTALLED_APPS = [
#     'django.contrib.admin',
#     'django.contrib.auth',
#     'django.contrib.contenttypes',
#     'django.contrib.sessions',
#     'django.contrib.messages',
#     'django.contrib.staticfiles',
#     'rest_framework',
#     'rest_framework_simplejwt',
#     'corsheaders',
#     'accounting',
#     'users',
# ]

SHARED_APPS = [
    'daphne',
    'channels',
    'django_tenants',
    'companies',
    'users',
    
    'rest_framework',      
    'rest_framework_simplejwt',
    'corsheaders',         
    
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework_simplejwt.token_blacklist',
]

TENANT_APPS = [
    'daphne',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.admin',
    'django.contrib.messages',
    
    'rest_framework',          
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    
    'users',
    'accounting',
    
]


# INSTALLED_APPS = SHARED_APPS + [app for app in TENANT_APPS if app not in SHARED_APPS]
INSTALLED_APPS = list(dict.fromkeys(SHARED_APPS + TENANT_APPS))

MIDDLEWARE = [
    'django_tenants.middleware.main.TenantMainMiddleware',
    
    # my middlwares
    'companies.middleware.TenantActiveCheckMiddleware',
    
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    
]






TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'




# DATABASES = {
#         'default': {
#             # 'ENGINE': 'django.db.backends.postgresql',
#             'ENGINE': 'django_tenants.postgresql_backend',
#             'NAME': 'erp_db',
#             'USER': 'postgres',
#             'PASSWORD': 'novedu112garagoz',
#             'HOST': '127.0.0.1',
#             'PORT': '5432',
#         }
#     }

# --- БАЗА ДАННЫХ ПОД DOCKER ---
DATABASES = {
    'default': {
        'ENGINE': 'django_tenants.postgresql_backend',
        'NAME': os.environ.get('DB_NAME', 'erp_db'),
        'USER': os.environ.get('DB_USER', 'postgres'),
        'PASSWORD': os.environ.get('DB_PASSWORD', 'novedu112garagoz'),
        # КРИТИЧЕСКОЕ ИЗМЕНЕНИЕ: Направляем Django на имя контейнера БД в сети Docker
        'HOST': os.environ.get('DB_HOST', 'db'), 
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}


# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.2/howto/static-files/

STATIC_URL = 'static/'

# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'



REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    )
}

# SIMPLE_JWT = {
#     'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
#     'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
#     'AUTH_HEADER_TYPES': ('Bearer',),
# }

SIMPLE_JWT = {
    # Access токен истечет через 1 минуту
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    # 'ACCESS_TOKEN_LIFETIME': timedelta(seconds=10),
    
    # Refresh токен истечет через 2 минуты
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    # 'REFRESH_TOKEN_LIFETIME': timedelta(seconds=30),
    
    'AUTH_HEADER_TYPES': ('Bearer',),
    
    # Полезно для тестов, чтобы убедиться, что токены отзываются
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
}

CORS_ALLOW_ALL_ORIGINS = True # Для разработки
CORS_ALLOW_CREDENTIALS = True




AUTH_USER_MODEL = 'users.User'

# Настройки для хранения фото
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')


DATABASE_ROUTERS = (
    'django_tenants.routers.TenantSyncRouter',
)


TENANT_MODEL = "companies.Company" # Ссылаемся на модель компании
TENANT_DOMAIN_MODEL = "companies.Domain" # Ссылаемся на модель домена





# Файл для ТЕНАНТОВ (клиентов)
ROOT_URLCONF = 'config.urls' 

# Файл для ПУБЛИЧНОЙ схемы (localhost)
PUBLIC_SCHEMA_URLCONF = 'config.urls_public'



# Изменяем настройки кук, чтобы сессии разных тенантов не пересекались
SESSION_COOKIE_DOMAIN = None
CSRF_COOKIE_DOMAIN = None


# Разрешаем Django читать заголовки прокси
USE_X_FORWARDED_HOST = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')



# Из этого места Nginx будет забирать собранную статику
STATIC_ROOT = os.path.join(BASE_DIR, 'static')







LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'loggers': {
        'django.request': {
            'handlers': ['console'],
            'level': 'DEBUG',  # Это покажет скрытые детали ошибок
            'propagate': True,
        },
    },
}






DEFAULT_FILE_STORAGE = 'utils.storage.TenantFileSystemStorage'




import sys
if 'test' in sys.argv:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.dummy.DummyCache',
        }
    }
    
    
    
  




# CHANNEL_LAYERS = {
#     "default": {
#         "BACKEND": "channels_redis.core.RedisChannelLayer",
#         "CONFIG": {
#             "hosts": [("127.0.0.1", 6380)],
#         },
#     },
# }


redis_url = os.environ.get('REDIS_URL', 'redis://127.0.0.1:6380/1')
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [redis_url],  # ← имя сервиса Docker
        },
    },
}
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    