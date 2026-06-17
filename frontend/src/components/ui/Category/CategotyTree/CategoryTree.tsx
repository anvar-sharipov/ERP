// frontend/src/components/ui/Category/CategotyTree/CategoryTree.tsx
import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Folder } from "lucide-react";
import { type TreeNode } from "./types";

export interface CategoryTreeProps {
  items: TreeNode[];
  selectedId: number | "all" | null;
  onSelect: (id: number | "all") => void;
  allLabel?: string;
  showSearch?: boolean;
  showInactive?: boolean;
  className?: string;
}

// ── хелперы (экспортируются для использования в CategoriesPage) ───────────────

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

// ── рекурсивный узел ─────────────────────────────────────────────────────────

interface NodeProps {
  node: TreeNode;
  allItems: TreeNode[];
  selectedId: number | "all" | null;
  onSelect: (id: number | "all") => void;
  showInactive: boolean;
  defaultExpanded?: boolean;
}

const SidebarTreeNode = ({ node, allItems, selectedId, onSelect, showInactive, defaultExpanded = true }: NodeProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const children = allItems.filter((c) => c.parent === node.id && (showInactive || c.is_active !== false));
  const hasChildren = children.length > 0;

  const isSelected = selectedId === node.id;
  const isInactive = node.is_active === false;

  return (
    <div>
      <button
        onClick={() => onSelect(node.id)}
        className={`
          w-full text-left flex items-center gap-1.5
          px-2 py-1.5 rounded transition-colors
          ${isSelected ? "bg-indigo-700 text-white" : isInactive ? "text-indigo-500 hover:bg-indigo-900/20" : "text-indigo-200 hover:bg-indigo-900/30"}
        `}
      >
        {/* кнопка свернуть/развернуть */}
        <span
          className="shrink-0 w-4 h-4 flex items-center justify-center"
          onClick={(e) => {
            if (!hasChildren) return;
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {hasChildren ? expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : null}
        </span>

        <Folder size={14} className={`shrink-0 ${isSelected ? "text-indigo-200" : "text-indigo-400"}`} />

        <span className="truncate text-sm leading-tight">
          {node.name}
          {isInactive && <span className="ml-1 text-indigo-600 text-xs">(неакт.)</span>}
        </span>
      </button>

      {expanded && hasChildren && (
        <div className="ml-3 border-l border-indigo-800/40 pl-1.5 mt-0.5 space-y-0.5">
          {children.map((child) => (
            <SidebarTreeNode key={child.id} node={child} allItems={allItems} selectedId={selectedId} onSelect={onSelect} showInactive={showInactive} defaultExpanded={defaultExpanded} />
          ))}
        </div>
      )}
    </div>
  );
};

// ── основной компонент ────────────────────────────────────────────────────────

const CategoryTree = ({ items, selectedId, onSelect, allLabel = "Все", showSearch = true, showInactive = true, className = "" }: CategoryTreeProps) => {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let source = items;
    if (!showInactive) source = source.filter((c) => c.is_active !== false);
    if (!search.trim()) return source;

    const q = search.toLowerCase();
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
    return source.filter((c) => matched.includes(c) || ancestorIds.has(c.id));
  }, [items, search, showInactive]);

  const roots = filtered.filter((c) => (c.parent ?? null) === null);

  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      {showSearch && items.length > 5 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск..."
          className="mb-2 px-2 py-1 rounded border border-indigo-700 bg-indigo-900/40 text-indigo-100 placeholder-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm"
        />
      )}

      {/* "Все" */}
      <button
        onClick={() => onSelect("all")}
        className={`
          w-full text-left flex items-center gap-1.5
          px-2 py-1.5 rounded transition-colors text-sm
          ${selectedId === "all" ? "bg-indigo-700 text-white" : "text-indigo-200 hover:bg-indigo-900/30"}
        `}
      >
        <span className="w-4 h-4 shrink-0" />
        <Folder size={14} className="shrink-0 text-indigo-400" />
        {allLabel}
      </button>

      {roots.map((root) => (
        <SidebarTreeNode key={root.id} node={root} allItems={filtered} selectedId={selectedId} onSelect={onSelect} showInactive={showInactive} defaultExpanded={!!search.trim()} />
      ))}

      {roots.length === 0 && <p className="text-indigo-500 px-2 py-1 text-sm">Ничего не найдено</p>}
    </div>
  );
};

export default CategoryTree;
