// frontend/src/components/ui/Category/CategotyTree/CategoryTreeNode.tsx
import { useState } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, GripVertical } from "lucide-react";
import { Button } from "../../../Button";
import { type TreeNode } from "../types";
import { getDescendantIds } from "../TreeFilter/CategoryTree";

interface Props {
  node: TreeNode;
  allItems: TreeNode[];
  onEdit: (item: TreeNode) => void;
  onDelete: (item: TreeNode) => void;
  // dnd
  draggedId: number | null;
  setDraggedId: (id: number | null) => void;
  onMove: (draggedId: number, targetId: number | null) => void;
}

export default function CategoryTreeNode({ node, allItems, onEdit, onDelete, draggedId, setDraggedId, onMove }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  const children = allItems.filter((x) => x.parent === node.id);
  const hasChildren = children.length > 0;
  const isInactive = node.is_active === false;

  const isDragging = draggedId === node.id;

  // нельзя дропнуть на себя или своего потомка
  const canDrop = draggedId !== null && draggedId !== node.id && !getDescendantIds(draggedId, allItems).includes(node.id);

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          setDraggedId(node.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          setDraggedId(null);
          setDragOver(false);
        }}
        onDragOver={(e) => {
          if (!canDrop) return;
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          // только если уходим за пределы самого элемента
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOver(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          if (canDrop) onMove(draggedId!, node.id);
        }}
        className={`
          group flex items-center gap-1.5
          px-2 py-1 rounded-md
          border transition-colors
          ${
            dragOver && canDrop
              ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 dark:border-indigo-500"
              : "border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"
          }
          ${isDragging ? "opacity-40" : ""}
          ${isInactive ? "opacity-60" : ""}
          cursor-grab active:cursor-grabbing
        `}
      >
        {/* grip handle */}
        <GripVertical size={13} className="shrink-0 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* chevron toggle */}
        <button
          type="button"
          className="shrink-0 w-4 h-4 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
          onClick={(e) => {
            e.stopPropagation();
            hasChildren && setExpanded((v) => !v);
          }}
          tabIndex={hasChildren ? 0 : -1}
          style={{ cursor: hasChildren ? "pointer" : "default" }}
        >
          {hasChildren ? expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
        </button>

        {/* folder icon */}
        {expanded && hasChildren ? (
          <FolderOpen size={15} className={`shrink-0 ${dragOver && canDrop ? "text-indigo-400 dark:text-indigo-300" : "text-amber-400 dark:text-amber-300"}`} />
        ) : (
          <Folder
            size={15}
            className={`shrink-0 ${dragOver && canDrop ? "text-indigo-400 dark:text-indigo-300" : hasChildren ? "text-amber-400 dark:text-amber-300" : "text-slate-400 dark:text-slate-500"}`}
          />
        )}

        {/* name */}
        <span
          className={`
            flex-1 truncate text-sm select-none
            ${isInactive ? "text-slate-400 dark:text-slate-500 line-through" : "text-slate-700 dark:text-slate-200"}
          `}
        >
          {node.name}
        </span>

        {/* actions */}
        <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="1c"
            icon={<span>✏️</span>}
            className="h-6 w-6 !p-0"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(node);
            }}
          />
          <Button
            variant="1c"
            icon={<span>🗑️</span>}
            className="h-6 w-6 !p-0"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node);
            }}
          />
        </div>
      </div>

      {expanded && hasChildren && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-slate-200 dark:border-slate-700 pl-2">
          {children.map((child) => (
            <CategoryTreeNode key={child.id} node={child} allItems={allItems} onEdit={onEdit} onDelete={onDelete} draggedId={draggedId} setDraggedId={setDraggedId} onMove={onMove} />
          ))}
        </div>
      )}
    </div>
  );
}
