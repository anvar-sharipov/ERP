# backend/companies/urls.py
# backend/companies/urls.py
from django.urls import path
from .views import CompanyListView, CompanyUpdateView, PlatformContactView

app_name = 'companies'
urlpatterns = [
    path('list/', CompanyListView.as_view(), name='list'),
    path('<int:pk>/', CompanyUpdateView.as_view(), name='update'),
    path('platform-contact/', PlatformContactView.as_view(), name='platform-contact'),
]




# from django.urls import path
# from .views import CompanyListView, CompanyUpdateView

# app_name = 'companies'



# app_name = 'companies'

# urlpatterns = [
#     path('list/', CompanyListView.as_view(), name='list'),
#     path('<int:pk>/', CompanyUpdateView.as_view(), name='update'),
# ]

