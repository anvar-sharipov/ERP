import { useState } from "react";
import { ChevronRight, ChevronDown, Folder } from "lucide-react";
import { Button } from "../../Button";
import { type TreeNode } from "./types";

// interface TreeNode {
//   id: number;
//   name: string;
//   parent: number | null;
//   is_active?: boolean;
// }

interface Props {
  node: TreeNode;
  allItems: TreeNode[];
  onEdit: (item: TreeNode) => void;
  onDelete: (item: TreeNode) => void;
}

export default function CategoryTreeNode({ node, allItems, onEdit, onDelete }: Props) {
  const [expanded, setExpanded] = useState(true);

  const children = allItems.filter((x) => x.parent === node.id);

  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        className="
          flex items-center
          justify-between
          gap-2
          px-2 py-0.5
          md:px-3 md:py-1
          rounded-lg
          border
          border-slate-200
          dark:border-slate-700
          bg-white
          dark:bg-slate-800
          hover:bg-slate-50
          dark:hover:bg-slate-700
        "
      >
        <div className="flex items-center gap-2">
          {hasChildren ? (
            <button onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronDown size={14} className="md:w-4 md:h-4" /> : <ChevronRight size={14} className="md:w-4 md:h-4" />}</button>
          ) : (
            <div className="w-4" />
          )}

          <Folder size={16} />

          <span className={node.is_active === false ? "opacity-50" : ""}>{node.name}</span>
        </div>

        <div className="flex gap-0.5 md:gap-1 shrink-0">
          <Button
            variant="1c"
            icon={<span>✏️</span>}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(node);
            }}
          />

          <Button
            variant="1c"
            icon={<span>🗑️</span>}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node);
            }}
          />
        </div>
      </div>

      {expanded && children.length > 0 && (
        <div className="ml-3 md:ml-8 mt-1 md:mt-2 space-y-1 md:space-y-2 border-l pl-2 md:pl-4">
          {children.map((child) => (
            <CategoryTreeNode key={child.id} node={child} allItems={allItems} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
