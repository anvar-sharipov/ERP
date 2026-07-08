# # accounting/models/__init__.py
# from .company import CompanyProfile, Branch
# from .directory import Directory, DirectoryField, DirectoryRecord
# from .subconto import SubcontoType
# from .account import Account, AccountSubconto
# from .transaction import JournalEntry, TransactionLine, ClosedPeriod
# from .stock import StockMovement, Warehouse, WarehouseStock
# from .product import (
#     Product, ProductCategory, Brand, Tag, Unit, 
#     ProductImage, PriceType, ProductPrice
# )
# from .counterparty import Counterparty
# from .employee import Position, Employee
# from .audit import AuditLog
# # from .document import Document, DocumentItem, DocumentParticipant  # если раскомментируете


# accounting/models/__init__.py
from .company import (
    CompanyProfile, Branch, DocumentSettings,
    company_logo_directory_path,
    company_logo2_directory_path,
    stamps_directory_path,
    signature_directory_path,
    branch_logo_directory_path,
    branch_signature_directory_path,
)
from .directory import Directory, DirectoryField, DirectoryRecord
from .subconto import SubcontoType
from .account import Account, AccountSubconto
from .transaction import JournalEntry, TransactionLine, ClosedPeriod
from .stock import StockMovement, Warehouse, WarehouseStock, WarehouseProductSnapshot
from .product import (
    Product, ProductCategory, Brand, Tag, Unit,
    ProductImage, PriceType, ProductPrice, ProductBundle, ProductBundle,
    VolumeDiscount, QuantityPromotion,
    product_image_path
)
from .counterparty import Counterparty
from .employee import Position, Employee, Agent
from .audit import AuditLog
from .alert import SystemAlert
from .document import DocumentParticipant, Document, DocumentItem
from .company import UserScope
from .currency import Currency, ExchangeRate


# ПРОКСИ-ФУНКЦИИ ДЛЯ СОВМЕСТИМОСТИ С МИГРАЦИЯМИ
# Эти функции перенаправляют вызовы в правильный модуль
# Нужны для того, чтобы старые миграции работали

def company_logo_directory_path(instance, filename):
    from .company import company_logo_directory_path as _path
    return _path(instance, filename)

def company_logo2_directory_path(instance, filename):
    from .company import company_logo2_directory_path as _path
    return _path(instance, filename)

def stamps_directory_path(instance, filename):
    from .company import stamps_directory_path as _path
    return _path(instance, filename)

def signature_directory_path(instance, filename):
    from .company import signature_directory_path as _path
    return _path(instance, filename)

def branch_logo_directory_path(instance, filename):
    from .company import branch_logo_directory_path as _path
    return _path(instance, filename)

def branch_signature_directory_path(instance, filename):
    from .company import branch_signature_directory_path as _path
    return _path(instance, filename)

def product_image_path(instance, filename):
    from .product import product_image_path as _path
    return _path(instance, filename)

# Также экспортируем все функции для прямого доступа
__all__ = [
    # Модели
    'CompanyProfile', 'Branch', 'DocumentSettings',
    'Directory', 'DirectoryField', 'DirectoryRecord',
    'SubcontoType',
    'Account', 'AccountSubconto',
    'JournalEntry', 'TransactionLine', 'ClosedPeriod',
    'StockMovement', 'Warehouse', 'WarehouseStock', 'WarehouseProductSnapshot',
    'Product', 'ProductCategory', 'Brand', 'Tag', 'Unit',
    'ProductImage', 'PriceType', 'ProductPrice',
    'Counterparty',
    'Position', 'Employee', 'Agent',
    'AuditLog',
    'SystemAlert',
    # Функции путей для файлов
    'company_logo_directory_path',
    'company_logo2_directory_path',
    'stamps_directory_path',
    'signature_directory_path',
    'branch_logo_directory_path',
    'branch_signature_directory_path',
    'product_image_path',
    'DocumentParticipant', 'Document', 'DocumentItem',
    'UserScope',
    'ProductBundle', 'ProductBundle', 'VolumeDiscount', 'QuantityPromotion',
    'Currency', 'ExchangeRate'
]