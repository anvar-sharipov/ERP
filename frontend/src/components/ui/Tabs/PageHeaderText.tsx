interface PageHeaderTextProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export const PageHeaderText = ({ title, description, actions }: PageHeaderTextProps) => {
  return (
    <div className="border-b border-gray-200 dark:border-gray-700 mb-6 print:mb-2">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="inline-flex px-4 py-3 border-b-2 border-blue-500 text-blue-600 dark:text-blue-500 font-medium print:px-0 print:py-0 print:border-b-0 print:text-black">{title}</div>

          {description && <p className="mt-2 px-4 text-sm text-gray-500 dark:text-gray-400 print:px-0 print:mt-1 print:text-xs print:text-gray-700">{description}</p>}
        </div>

        {actions && <div className="flex items-center gap-2 print:hidden">{actions}</div>}
      </div>
    </div>
  );
};
