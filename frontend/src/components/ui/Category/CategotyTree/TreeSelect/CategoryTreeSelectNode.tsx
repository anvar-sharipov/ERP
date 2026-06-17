// frontend/src/components/ui/Category/CategotyTree/CategoryTreeSelectNode.tsx
import { useState } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, Check } from "lucide-react";
import { type TreeNode } from "../types";

interface Props {
  node: TreeNode;
  allItems: TreeNode[];
  value: number | null;
  onSelect: (id: number) => void;
}

export default function CategoryTreeSelectNode({ node, allItems, value, onSelect }: Props) {
  const [expanded, setExpanded] = useState(true);

  const children = allItems.filter((x) => x.parent === node.id);
  const hasChildren = children.length > 0;
  const isSelected = value === node.id;
  const isInactive = node.is_active === false;

  return (
    <div>
      <div
        className={`
          group flex items-center gap-1.5
          px-2 py-1.5 cursor-pointer
          transition-colors
          ${isSelected ? "bg-indigo-50 dark:bg-indigo-900/40" : "hover:bg-slate-50 dark:hover:bg-slate-700/50"}
          ${isInactive ? "opacity-60" : ""}
        `}
        onClick={() => onSelect(node.id)}
      >
        {/* chevron toggle */}
        <button
          type="button"
          className="shrink-0 w-4 h-4 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
          onClick={(e) => {
            if (!hasChildren) return;
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          tabIndex={-1}
          style={{ cursor: hasChildren ? "pointer" : "default" }}
        >
          {hasChildren ? expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
        </button>

        {/* folder icon */}
        {expanded && hasChildren ? (
          <FolderOpen size={15} className={`shrink-0 ${isSelected ? "text-indigo-400 dark:text-indigo-300" : "text-amber-400 dark:text-amber-300"}`} />
        ) : (
          <Folder size={15} className={`shrink-0 ${isSelected ? "text-indigo-400 dark:text-indigo-300" : hasChildren ? "text-amber-400 dark:text-amber-300" : "text-slate-400 dark:text-slate-500"}`} />
        )}

        {/* name */}
        <span
          className={`
            flex-1 truncate text-sm
            ${isSelected ? "text-indigo-700 dark:text-indigo-200 font-medium" : isInactive ? "text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-200"}
          `}
        >
          {node.name}
        </span>

        {/* check */}
        {isSelected && <Check size={13} className="shrink-0 text-indigo-500 dark:text-indigo-300" />}
      </div>

      {expanded && hasChildren && (
        <div className="ml-5 border-l border-slate-200 dark:border-slate-700 pl-1">
          {children.map((child) => (
            <CategoryTreeSelectNode key={child.id} node={child} allItems={allItems} value={value} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
