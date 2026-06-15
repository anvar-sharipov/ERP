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