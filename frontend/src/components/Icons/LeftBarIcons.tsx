import {
  ShieldCheckIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  DocumentChartBarIcon,
  BriefcaseIcon,
  QueueListIcon,
  UserCircleIcon,
  ShoppingBagIcon,
  BuildingStorefrontIcon,
  ClipboardDocumentListIcon,
  KeyIcon,
  ComputerDesktopIcon,
} from "@heroicons/react/24/outline";

// Добавляем эффект свечения и чуть более светлые тона для темных тем
const iconClassName = "w-5 h-5 transition-all duration-300 group-hover:scale-110";

export const ADMIN_ICON = <ShieldCheckIcon className={`${iconClassName} text-purple-400`} />;
export const COMPANY_ICON = <BuildingOfficeIcon className={`${iconClassName} text-blue-400`} />;
export const BRANCH_ICON = <BriefcaseIcon className={`${iconClassName} text-indigo-400`} />;
export const USERS_ICON = <UserGroupIcon className={`${iconClassName} text-sky-400`} />;
export const ACCOUNT_ICON = <DocumentChartBarIcon className={`${iconClassName} text-emerald-400`} />;
export const DIRECTORY_ICON = <QueueListIcon className={`${iconClassName} text-purple-400`} />;

export const COUNTERPARTY_ICON = <UserCircleIcon className={`${iconClassName} text-orange-400`} />;
export const WAREHOUSE_ICON = <BuildingStorefrontIcon className={`${iconClassName} text-amber-400`} />;
export const PRODUCT_ICON = <ShoppingBagIcon className={`${iconClassName} text-rose-400`} />;

export const JOURNAL_ICON = <ClipboardDocumentListIcon className={`${iconClassName} text-yellow-400`} />;
export const ROLES_ICON = <KeyIcon className={`${iconClassName} text-red-400`} />;
export const DASHBOARD_ICON = <ComputerDesktopIcon className={`${iconClassName} text-cyan-400`} />;
