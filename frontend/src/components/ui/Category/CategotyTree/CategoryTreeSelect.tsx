import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import CategoryTreeSelectNode from "./CategoryTreeSelectNode";
import { type TreeNode } from "./types";
import { Input } from "../../Input";
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
      <label
        className="
          block
          font-medium
          mb-2
        "
      >
        {t("Parent")}
      </label>

      <div
        className="
          border
          rounded-lg
          overflow-hidden
          bg-white
          dark:bg-slate-800
        "
      >
        <div
          className="
            sticky
            top-0
            z-10
            p-1
            md:p-2
            border-b
            bg-white
            dark:bg-slate-800
          "
        >
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search")} leftIcon={<Search size={18} />} />
        </div>

        <div
          className="
            h-72
            overflow-y-auto
          "
        >
          <button
            type="button"
            className={`
              w-full
              text-left
              px-3
              py-2
              hover:bg-slate-100
              dark:hover:bg-slate-700
              transition-colors
              ${value === null ? "bg-indigo-100 dark:bg-indigo-900" : ""}
            `}
            onClick={() => onChange(null)}
          >
            {t("NoParent")}
          </button>

          {filteredItems
            .filter((x) => x.parent === null)
            .map((root) => (
              <CategoryTreeSelectNode key={root.id} node={root} allItems={filteredItems} value={value} onSelect={onChange} />
            ))}
        </div>
      </div>
    </div>
  );
}
