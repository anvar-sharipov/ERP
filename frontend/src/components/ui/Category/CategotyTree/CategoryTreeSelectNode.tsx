import { useState } from "react";
import { ChevronRight, ChevronDown, Folder, Check } from "lucide-react";

import { type TreeNode } from "./types";

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

  return (
    <div>
      <div
        className={`
    flex
    items-center
    justify-between
    px-2 py-1
    md:px-3 md:py-2
    cursor-pointer
    transition-colors
    hover:bg-slate-100
    dark:hover:bg-slate-700
    ${value === node.id ? "bg-indigo-100 dark:bg-indigo-900" : ""}
  `}
        onClick={() => onSelect(node.id)}
      >
        <div className="flex items-center gap-2">
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              {expanded ? <ChevronDown size={14} className="md:w-4 md:h-4" /> : <ChevronRight size={14} className="md:w-4 md:h-4" />}
            </button>
          ) : (
            <div className="w-[14px]" />
          )}

          <Folder size={14} className="md:w-4 md:h-4" />

          <span>{node.name}</span>
        </div>

        {value === node.id && <Check size={14} className="md:w-4 md:h-4" />}
      </div>

      {expanded && children.length > 0 && (
        <div className="ml-6">
          {children.map((child) => (
            <CategoryTreeSelectNode key={child.id} node={child} allItems={allItems} value={value} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
