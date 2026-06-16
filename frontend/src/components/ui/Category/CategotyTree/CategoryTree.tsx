// frontend/src/components/ui/CategoryTree/CategoryTree.tsx
import { useState, useMemo } from "react";
import { type TreeNode } from "./types";


// ── типы ──────────────────────────────────────────────────────────────────────

// export interface TreeNode {
//   id: number;
//   name: string;
//   parent: number | null;
//   is_active?: boolean;
//   [key: string]: any; // доп. поля
// }

interface CategoryTreeProps {
  items: TreeNode[];
  selectedId: number | "all" | null;
  onSelect: (id: number | "all") => void;
  allLabel?: string; // текст первого пункта "Все"
  showSearch?: boolean; // показывать поиск по дереву
  showInactive?: boolean; // показывать неактивные (серым)
  className?: string;
}

// ── хелперы ───────────────────────────────────────────────────────────────────

export const buildFlatTree = (items: TreeNode[], parentId: number | null = null, level = 0): { item: TreeNode; level: number }[] =>
  items.filter((c) => (c.parent ?? null) === parentId).flatMap((c) => [{ item: c, level }, ...buildFlatTree(items, c.id, level + 1)]);

export const getDescendantIds = (id: number, items: TreeNode[]): number[] => {
  const children = items.filter((c) => c.parent === id);
  return [id, ...children.flatMap((c) => getDescendantIds(c.id, items))];
};

export const getBreadcrumb = (item: TreeNode, items: TreeNode[], separator = " > "): string => {
  const parts: string[] = [item.name];
  let current = item;
  while (current.parent) {
    const parent = items.find((c) => c.id === current.parent);
    if (!parent) break;
    parts.unshift(parent.name);
    current = parent;
  }
  return parts.join(separator);
};

// возвращает глубину узла
export const getNodeLevel = (item: TreeNode, items: TreeNode[]): number => {
  let level = 0;
  let current = item;
  while (current.parent) {
    const parent = items.find((c) => c.id === current.parent);
    if (!parent) break;
    level++;
    current = parent;
  }
  return level;
};

// ── компонент ─────────────────────────────────────────────────────────────────

const CategoryTree = ({ items, selectedId, onSelect, allLabel = "Все", showSearch = true, showInactive = true, className = "" }: CategoryTreeProps) => {
  const [search, setSearch] = useState("");

  const flatTree = useMemo(() => {
    let source = items;
    if (!showInactive) source = source.filter((c) => c.is_active !== false);
    if (search.trim()) {
      const q = search.toLowerCase();
      // показываем совпадения + всех их предков
      const matched = source.filter((c) => c.name.toLowerCase().includes(q));
      const ancestorIds = new Set<number>();
      matched.forEach((c) => {
        let cur = c;
        while (cur.parent) {
          ancestorIds.add(cur.parent);
          const parent = source.find((p) => p.id === cur.parent);
          if (!parent) break;
          cur = parent;
        }
      });
      source = source.filter((c) => matched.includes(c) || ancestorIds.has(c.id));
    }
    return buildFlatTree(source);
  }, [items, search, showInactive]);

  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      {showSearch && items.length > 5 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск..."
          className="mb-2 px-2 py-1 rounded border border-indigo-700 bg-indigo-900/40 text-indigo-100 placeholder-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      )}

      {/* Пункт "Все" */}
      <button
        onClick={() => onSelect("all")}
        className={`w-full text-left px-2 py-1.5 rounded transition-colors ${selectedId === "all" ? "bg-indigo-700 text-white" : "text-indigo-200 hover:bg-indigo-900/30"}`}
      >
        {allLabel}
      </button>

      {flatTree.map(({ item, level }) => {
        const isSelected = selectedId === item.id;
        const isInactive = item.is_active === false;
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`w-full text-left py-1.5 pr-2 rounded transition-colors ${
              isSelected ? "bg-indigo-700 text-white" : isInactive ? "text-indigo-500 hover:bg-indigo-900/20" : "text-indigo-200 hover:bg-indigo-900/30"
            }`}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
          >
            {level > 0 && <span className={`mr-1 ${isSelected ? "text-indigo-300" : "text-indigo-500"}`}>└</span>}
            {item.name}
            {isInactive && <span className="ml-1 text-indigo-600 text-xs">(неакт.)</span>}
          </button>
        );
      })}

      {flatTree.length === 0 && <p className="text-indigo-500 px-2 py-1">Ничего не найдено</p>}
    </div>
  );
};

export default CategoryTree;
