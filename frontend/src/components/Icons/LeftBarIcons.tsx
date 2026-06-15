// frontend/src/components/Icons/LeftBarIcons.tsx
import { 
  ShieldCheckIcon, 
  BuildingOfficeIcon, 
  UserGroupIcon, 
  DocumentChartBarIcon,
  BriefcaseIcon, 
  QueueListIcon,
} from '@heroicons/react/24/outline';

const iconClassName = "w-5 h-5"; // Или ваши размеры

export const ADMIN_ICON = <ShieldCheckIcon className={iconClassName} />;
export const COMPANY_ICON = <BuildingOfficeIcon className={iconClassName} />;
export const BRANCH_ICON = <BriefcaseIcon className={iconClassName} />;
export const USERS_ICON = <UserGroupIcon className={iconClassName} />;
export const ACCOUNT_ICON = <DocumentChartBarIcon className={iconClassName} />;
export const DIRECTORY_ICON = <QueueListIcon className={iconClassName} />;