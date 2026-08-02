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
  IdentificationIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ArrowsRightLeftIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ChatBubbleLeftRightIcon,
  // ChatBubbleLeftIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  BellAlertIcon,
  PresentationChartLineIcon,
  TruckIcon,
} from "@heroicons/react/24/outline";

// Добавляем эффект свечения и чуть более светлые тона для темных тем
const iconClassName = "w-5 h-5 transition-all duration-300 group-hover:scale-110";

export const ADMIN_ICON = <ShieldCheckIcon className={`${iconClassName} text-purple-400`} />;
export const COMPANY_ICON = <BuildingOfficeIcon className={`${iconClassName} text-blue-400`} />;
export const BRANCH_ICON = <BriefcaseIcon className={`${iconClassName} text-indigo-400`} />;
export const DOCUMENT_SETTINGS_ICON = <Cog6ToothIcon className={`${iconClassName} text-gray-400`} />;
export const USERS_ICON = <UserGroupIcon className={`${iconClassName} text-sky-400`} />;
export const ACCOUNT_ICON = <DocumentChartBarIcon className={`${iconClassName} text-emerald-400`} />;
export const DIRECTORY_ICON = <QueueListIcon className={`${iconClassName} text-purple-400`} />;

export const COUNTERPARTY_ICON = <UserCircleIcon className={`${iconClassName} text-orange-400`} />;
export const WAREHOUSE_ICON = <BuildingStorefrontIcon className={`${iconClassName} text-amber-400`} />;
export const PRODUCT_ICON = <ShoppingBagIcon className={`${iconClassName} text-rose-400`} />;

export const JOURNAL_ICON = <ClipboardDocumentListIcon className={`${iconClassName} text-yellow-400`} />;
export const ROLES_ICON = <KeyIcon className={`${iconClassName} text-red-400`} />;
export const DASHBOARD_ICON = <ComputerDesktopIcon className={`${iconClassName} text-cyan-400`} />;

// export const EMPLOYEES_ICON = <UserGroupIcon className={`${iconClassName} text-teal-400`} />;
export const EMPLOYEES_ICON = <IdentificationIcon className={`${iconClassName} text-teal-400`} />;
export const DOCUMENTS_ICON = <DocumentTextIcon className={`${iconClassName} text-red-500`} />;

export const DOC_IN_ICON = <ArrowDownTrayIcon className={`${iconClassName} text-green-400`} />;
export const DOC_OUT_ICON = <ArrowUpTrayIcon className={`${iconClassName} text-red-400`} />;
export const DOC_MOVE_ICON = <ArrowsRightLeftIcon className={`${iconClassName} text-blue-400`} />;
export const DOC_RETURN_IN_ICON = <ArrowUturnLeftIcon className={`${iconClassName} text-emerald-400`} />;
export const DOC_RETURN_OUT_ICON = <ArrowUturnRightIcon className={`${iconClassName} text-orange-400`} />;

export const CHAT_ICON = <ChatBubbleLeftRightIcon className={`${iconClassName} text-sky-400`} />;
export const REPORTS_ICON = <ChartBarIcon className={`${iconClassName} text-lime-400`} />;
export const ANALYTICS_ICON = <PresentationChartLineIcon className={`${iconClassName} text-fuchsia-400`} />;
export const ALERTS_ICON = <BellAlertIcon className={`${iconClassName} text-red-400`} />;
export const TRIPS_ICON = <TruckIcon className={`${iconClassName} text-cyan-500`} />;
// export const CHAT_ICON = <ChatBubbleLeftIcon className={`${iconClassName} text-sky-400`} />;
