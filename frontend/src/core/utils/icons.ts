// src/core/utils/icon.ts
import * as LucideIcons from "lucide-react";
import {
  Warehouse,
  Building2,
  Users,
  User,
  UserCheck,
  UserCog,
  UserRound,
  Briefcase,
  Contact,

  Package,
  Boxes,
  Box,
  Archive,
  // ArchiveRestore,

  ShoppingCart,
  ShoppingBag,
  Store,
  StoreIcon,

  Truck,
  Bus,
  Car,
  Ship,
  Plane,
  Train,

  Wallet,
  Banknote,
  CreditCard,
  Receipt,
  ReceiptText,
  PiggyBank,
  Landmark,
  CircleDollarSign,

  FileText,
  Files,
  FileSpreadsheet,
  FileBarChart,
  FileCheck,
  FileClock,

  Calculator,
  // Percent,
  // BadgePercent,

  ClipboardList,
  ClipboardCheck,
  ClipboardPen,
  Folder,
  FolderOpen,
  FolderTree,

  Database,
  DatabaseBackup,
  HardDrive,

  BarChart3,
  PieChart,
  LineChart,
  TrendingUp,
  TrendingDown,

  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Key,

  Settings,
  Cog,
  Wrench,
  Hammer,
  Drill,

  Building,
  Factory,
  // Home,
  // Hotel,
  // Hospital,
  // School,

  Globe,
  Map,
  MapPin,
  Navigation,

  Phone,
  Smartphone,
  Mail,
  Send,

  Calendar,
  Clock,
  AlarmClock,

  Image,
  Images,
  Camera,
  Video,

  Monitor,
  Laptop,
  Tablet,
  Printer,
  Server,
  Network,

  ScanLine,
  QrCode,
  Barcode,

  Bell,
  BellRing,
  MessageSquare,

  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,

  Star,
  Heart,
  Flag,

  Workflow,
  GitBranch,
  Route,

  PackageCheck,
  PackageOpen,
  PackageSearch,

  ClipboardType,
  ScrollText,
} from "lucide-react";

export const DIRECTORY_ICONS = [
  // Организации
  { name: "Building2", icon: Building2 },
  { name: "Building", icon: Building },
  { name: "Factory", icon: Factory },
  { name: "Store", icon: Store },
  { name: "StoreIcon", icon: StoreIcon },
  { name: "Warehouse", icon: Warehouse },

  // Пользователи
  { name: "Users", icon: Users },
  { name: "User", icon: User },
  { name: "UserCheck", icon: UserCheck },
  { name: "UserCog", icon: UserCog },
  { name: "UserRound", icon: UserRound },
  { name: "Briefcase", icon: Briefcase },
  { name: "Contact", icon: Contact },

  // Товары
  { name: "Package", icon: Package },
  { name: "PackageCheck", icon: PackageCheck },
  { name: "PackageOpen", icon: PackageOpen },
  { name: "PackageSearch", icon: PackageSearch },
  { name: "Boxes", icon: Boxes },
  { name: "Box", icon: Box },
  { name: "Archive", icon: Archive },

  // Продажи
  { name: "ShoppingCart", icon: ShoppingCart },
  { name: "ShoppingBag", icon: ShoppingBag },

  // Логистика
  { name: "Truck", icon: Truck },
  { name: "Car", icon: Car },
  { name: "Bus", icon: Bus },
  { name: "Ship", icon: Ship },
  { name: "Plane", icon: Plane },
  { name: "Train", icon: Train },

  // Финансы
  { name: "Wallet", icon: Wallet },
  { name: "Banknote", icon: Banknote },
  { name: "CreditCard", icon: CreditCard },
  { name: "Receipt", icon: Receipt },
  { name: "ReceiptText", icon: ReceiptText },
  { name: "PiggyBank", icon: PiggyBank },
  { name: "Landmark", icon: Landmark },
  { name: "CircleDollarSign", icon: CircleDollarSign },
  { name: "Calculator", icon: Calculator },

  // Документы
  { name: "FileText", icon: FileText },
  { name: "Files", icon: Files },
  { name: "FileSpreadsheet", icon: FileSpreadsheet },
  { name: "FileBarChart", icon: FileBarChart },
  { name: "FileCheck", icon: FileCheck },
  { name: "FileClock", icon: FileClock },

  // Регистры
  { name: "ClipboardList", icon: ClipboardList },
  { name: "ClipboardCheck", icon: ClipboardCheck },
  { name: "ClipboardPen", icon: ClipboardPen },
  { name: "ClipboardType", icon: ClipboardType },

  // Папки
  { name: "Folder", icon: Folder },
  { name: "FolderOpen", icon: FolderOpen },
  { name: "FolderTree", icon: FolderTree },

  // Аналитика
  { name: "BarChart3", icon: BarChart3 },
  { name: "PieChart", icon: PieChart },
  { name: "LineChart", icon: LineChart },
  { name: "TrendingUp", icon: TrendingUp },
  { name: "TrendingDown", icon: TrendingDown },

  // База данных
  { name: "Database", icon: Database },
  { name: "DatabaseBackup", icon: DatabaseBackup },
  { name: "HardDrive", icon: HardDrive },

  // Безопасность
  { name: "Shield", icon: Shield },
  { name: "ShieldCheck", icon: ShieldCheck },
  { name: "ShieldAlert", icon: ShieldAlert },
  { name: "Lock", icon: Lock },
  { name: "Key", icon: Key },

  // Настройки
  { name: "Settings", icon: Settings },
  { name: "Cog", icon: Cog },
  { name: "Wrench", icon: Wrench },
  { name: "Hammer", icon: Hammer },
  { name: "Drill", icon: Drill },

  // Карты
  { name: "Map", icon: Map },
  { name: "MapPin", icon: MapPin },
  { name: "Navigation", icon: Navigation },
  { name: "Globe", icon: Globe },

  // Связь
  { name: "Phone", icon: Phone },
  { name: "Smartphone", icon: Smartphone },
  { name: "Mail", icon: Mail },
  { name: "Send", icon: Send },

  // Время
  { name: "Calendar", icon: Calendar },
  { name: "Clock", icon: Clock },
  { name: "AlarmClock", icon: AlarmClock },

  // Медиа
  { name: "Image", icon: Image },
  { name: "Images", icon: Images },
  { name: "Camera", icon: Camera },
  { name: "Video", icon: Video },

  // IT
  { name: "Monitor", icon: Monitor },
  { name: "Laptop", icon: Laptop },
  { name: "Tablet", icon: Tablet },
  { name: "Printer", icon: Printer },
  { name: "Server", icon: Server },
  { name: "Network", icon: Network },

  // Штрихкоды
  { name: "QrCode", icon: QrCode },
  { name: "Barcode", icon: Barcode },
  { name: "ScanLine", icon: ScanLine },

  // Уведомления
  { name: "Bell", icon: Bell },
  { name: "BellRing", icon: BellRing },
  { name: "MessageSquare", icon: MessageSquare },

  // Статусы
  { name: "CheckCircle", icon: CheckCircle },
  { name: "XCircle", icon: XCircle },
  { name: "AlertTriangle", icon: AlertTriangle },
  { name: "Info", icon: Info },

  // Бизнес-процессы
  { name: "Workflow", icon: Workflow },
  { name: "GitBranch", icon: GitBranch },
  { name: "Route", icon: Route },

  // Прочее
  { name: "Star", icon: Star },
  { name: "Heart", icon: Heart },
  { name: "Flag", icon: Flag },
  { name: "ScrollText", icon: ScrollText },
];


export const getIconByName = (name: string) => {
  // LucideIcons содержит все экспорты, ищем нужный по имени
  const IconComponent = (LucideIcons as any)[name];
  return IconComponent || LucideIcons.HelpCircle; // Возвращаем иконку по умолчанию, если не найдена
};


