// frontend/src/components/ui/Category/CategotyTree/CategoryTreeSelect.tsx
import { useMemo, useState } from "react";
import { Search, FolderOpen, Check } from "lucide-react";
import CategoryTreeSelectNode from "./CategoryTreeSelectNode";
import { type TreeNode } from "../types";
import { Input } from "../../../Input";
import { useTranslation } from "react-i18next";

interface Props {
  items: TreeNode[];
  value: number | null;
  onChange: (id: number | null) => void;
}

export default function CategoryTreeSelect({ items, value, onChange }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;

    const q = search.toLowerCase();
    const matched = items.filter((x) => x.name.toLowerCase().includes(q));
    const ancestors = new Set<number>();

    matched.forEach((item) => {
      let current = item;
      while (current.parent) {
        ancestors.add(current.parent);
        const parent = items.find((x) => x.id === current.parent);
        if (!parent) break;
        current = parent;
      }
    });

    return items.filter((x) => matched.includes(x) || ancestors.has(x.id));
  }, [items, search]);

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t("Parent")}</label>

      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
        {/* поиск */}
        <div className="sticky top-0 z-10 p-1.5 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search")} leftIcon={<Search size={15} />} />
        </div>

        <div className="h-64 overflow-y-auto">
          {/* "Без родителя" */}
          <div
            className={`
              flex items-center gap-1.5
              px-2 py-1.5 cursor-pointer transition-colors
              ${value === null ? "bg-indigo-50 dark:bg-indigo-900/40" : "hover:bg-slate-50 dark:hover:bg-slate-700/50"}
            `}
            onClick={() => onChange(null)}
          >
            <span className="w-4 h-4 shrink-0" />
            <FolderOpen size={15} className={`shrink-0 ${value === null ? "text-indigo-400 dark:text-indigo-300" : "text-slate-300 dark:text-slate-600"}`} />
            <span className={`flex-1 text-sm ${value === null ? "text-indigo-700 dark:text-indigo-200 font-medium" : "text-slate-500 dark:text-slate-400"}`}>{t("NoParent")}</span>
            {value === null && <Check size={13} className="shrink-0 text-indigo-500 dark:text-indigo-300" />}
          </div>

          {/* дерево */}
          {filteredItems
            .filter((x) => x.parent === null)
            .map((root) => (
              <CategoryTreeSelectNode key={root.id} node={root} allItems={filteredItems} value={value} onSelect={onChange} />
            ))}

          {filteredItems.length === 0 && <p className="px-3 py-3 text-sm text-slate-400 dark:text-slate-500">{t("NothingFound")}</p>}
        </div>
      </div>
    </div>
  );
}
