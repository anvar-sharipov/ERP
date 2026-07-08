// frontend/src/core/types/index.ts
export interface User {
  id: string | number;
  username: string;
  photo: string | null;
  photo_thumbnail: string | null; // Добавлено
  email: string;
  full_name: string;             // Добавлено
  position: string;              // Добавлено
  is_active: boolean;            // Добавлено
  roles: { id: number; name: string }[]; // Добавлено, судя по коду выше
  phone: string;                 // Добавлено
  first_name: string;
  last_name: string;
}


export interface CompanyProfile {
  id: number;
  name: string;
  tax_id: string;
  director_name: string;
  chief_accountant_name: string;
  
  // Контакты
  phone_official: string;
  phone_official2?: string;
  email_official: string;
  email_official2?: string;
  website: string;
  website2?: string;
  address: string;

  // Реквизиты
  bank_name: string;
  bank_account: string;
  mfo: string;
  legal_reg_date: string | null;
  base_currency: string;

  // Медиа (URL)
  logo?: string | null;
  logo2?: string | null;
  stamp_image?: string | null;
  signature_image?: string | null;

  // Миниатюры (Read-only)
  logo_thumbnail?: string | null;
  logo2_thumbnail?: string | null;
  stamp_image_thumbnail?: string | null;
  signature_image_thumbnail?: string | null;

  // Вложенные данные
  branches: Branch[];
}



export interface Branch {
  id: number;
  name: string;
  code?: string; // Код филиала
  is_head_office: boolean;
  is_active: boolean;
  
  // Контакты
  address: string;
  city: string;
  phone: string;
  email: string;
  website: string;

  // Ответственные
  manager_name: string;
  manager_position: string;

  // Текст внизу счёта-фактуры (печать/Excel)
  slogan?: string;

  // Изображения (URL)
  logo?: string | null;
  signature_image?: string | null;
  
  // Внешний ключ (ID компании)
  company_profile: number;
  
  logo_thumbnail?: string | null;

  signature_image_thumbnail?: string | null;
}



export interface Account {
  id: number;
  code: string;
  name: string;
  is_group: boolean;
  parent: number | null;
  parent_code?: string;
  // Поле children приходит из сериализатора при чтении списка
  children?: Account[];
  account_subcontos?: AccountSubconto[];
  account_type?: string; 
  account_type_display?: string;
  is_active: boolean;
  
}


export interface Directory {
  id: number;
  name: string;
  slug: string;
  icon: string;
}



export interface Brand {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
}


export interface Unit {
  id: number;
  name: string;
  short_name: string;
}

export interface Directory {
  name: string;
  slug: string;
  icon: string;
  color: string;
  description: string;
  is_active: boolean;
}


export interface Role {
  id: number;
  name: string;
}

export interface ProductImage {
  id: number;
  product: number;
  image_url: string | null;
  thumbnail_url: string | null;
  is_main: boolean;
  sort_order: number;
  alt_text: string;
  created_at: string;
}

export interface PriceType {
  id: number;
  name: string;
}

export interface ProductPrice {
  id: number;
  product: number;
  warehouse: number | null;
  warehouse_name: string | null;
  price_type: number;
  price_type_name: string;
  price: string;
  valid_from: string;
  valid_to: string | null;
  is_active: boolean;
}

export interface Product {
  id: number;
  name: string;
  sku: string;
  image_mode: "contain" | "cover";
  barcode: string | null;
  qr_code: string | null;
  category: number | null;
  category_detail: { id: number; name: string } | null;
  brand: number | null;
  brand_detail: { id: number; name: string } | null;
  unit: number | null;
  unit_detail: { id: number; name: string; short_name: string } | null;
  tag_ids: number[];
  tags_detail: { id: number; name: string; slug: string }[];
  allowed_warehouse_ids: number[];
  allowed_warehouses_detail: { id: number; name: string }[];
  cost_price: string;
  min_stock_level: number;
  is_active: boolean;
  extra_data: Record<string, unknown>;
  images: ProductImage[];
  main_image: ProductImage | null;
  prices: ProductPrice[];
  length: string;
  width: string;
  height: string;
  weight: string;
  volume_m3: string;
  created_at: string;
  updated_at: string;
  description: string;
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
}

export interface ProductCategory {
  id: number;
  name: string;
  slug: string;
  parent: number | null;
  is_active: boolean;
}

export interface Warehouse {
  id: number;
  name: string;
  branch: number | null;
  branch_name: string | null;
  address: string;
  is_active: boolean;
  is_main: boolean;
}


interface AccountSubconto {
  id: number;
  account: number;
  subconto_type: number;
  subconto_type_detail: {
    id: number;
    name: string;
    slug: string;
    directory: number | null;
    directory_name: string | null;
    content_type: number;
    content_type_detail: { id: number; app_label: string; model: string; label: string };
  };
  order: number;
}



export interface Position {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
}

export interface Employee {
  id: number;
  full_name: string;
  position: number | null;
  position_name?: string;
  phone: string;
  note: string;
  is_active: boolean;
}


export interface AuditLog {
  id: number
  user: number | null
  user_display: string
  action: 'create' | 'update' | 'delete' | 'post' | 'unpost'
  action_display: string
  model_name: string
  object_id: number
  object_repr: string
  changed_data: Record<string, { before: string; after: string } | string>
  ip_address: string | null
  timestamp: string
}



 
export interface DocumentShort {
  id: number;
  name: string;
}
 
export interface DocumentList {
  id: number;
  number: string;
  document_type: string;
  document_type_display: string;
  status: "draft" | "posted";
  status_display: string;
  date: string;
  counterparty: number | null;
  counterparty_detail: { id: number; name: string; phone?: string; photo?: string | null; photo_thumbnail?: string | null } | null;
  warehouse: number | null;
  warehouse_detail: { id: number; name: string } | null;
  total: string;
  created_at: string;
  branch_detail: { id: number; name: string } | null;
  has_discount: boolean;
  has_gift: boolean;
  has_bundle: boolean;
  created_by: number | null;
  created_by_name?: string | null;
  posted_by: number | null;
  posted_by_name?: string | null;
  note?: string;
}
 

















