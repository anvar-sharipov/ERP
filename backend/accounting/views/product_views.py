# backend/accounting/views/product_views.py
from rest_framework.views import APIView
from rest_framework.response import Response
from users.permissions import HasPermission
from ..models import Product


class ProductListView(APIView):
    # Если юзер не имеет прав, он получит 403 Forbidden
    permission_classes = [HasPermission('product', 'GET')]

    def get(self, request):
        products = Product.objects.all()
        return Response({"products": [p.name for p in products]})

class ProductCreateView(APIView):
    permission_classes = [HasPermission('product', 'POST')]

    def post(self, request):
        name = request.data.get('name')
        product = Product.objects.create(name=name)
        return Response({"message": "Товар создан", "id": product.id}, status=201)