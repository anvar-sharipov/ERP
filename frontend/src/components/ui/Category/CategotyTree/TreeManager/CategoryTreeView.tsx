// frontend/src/components/ui/Category/CategotyTree/CategoryTreeView.tsx
import { useState } from "react";
import { FolderOpen } from "lucide-react";
import CategoryTreeNode from "./CategoryTreeNode";
import { type TreeNode } from "../types";
import { getDescendantIds } from "../TreeFilter/CategoryTree";

interface Props {
  items: TreeNode[];
  onEdit: (item: TreeNode) => void;
  onDelete: (item: TreeNode) => void;
  onMove: (draggedId: number, targetId: number | null) => void;
}

export default function CategoryTreeView({ items, onEdit, onDelete, onMove }: Props) {
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [rootDragOver, setRootDragOver] = useState(false);

  const roots = items.filter((x) => x.parent === null);

  // можно дропнуть в корень если перетаскиваем не-корневой узел
  const canDropToRoot = draggedId !== null && items.find((x) => x.id === draggedId)?.parent !== null;

  return (
    <div
      // зона "дроп в корень" — весь контейнер, но визуал только снизу
      onDragOver={(e) => {
        if (!canDropToRoot) return;
        e.preventDefault();
        setRootDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setRootDragOver(false);
        }
      }}
      onDrop={(e) => {
        // дроп на сам контейнер (не перехвачен узлом) = в корень
        setRootDragOver(false);
        if (canDropToRoot) onMove(draggedId!, null);
      }}
      className="space-y-0.5"
    >
      {roots.map((root) => (
        <CategoryTreeNode key={root.id} node={root} allItems={items} onEdit={onEdit} onDelete={onDelete} draggedId={draggedId} setDraggedId={setDraggedId} onMove={onMove} />
      ))}

      {/* Drop zone "в корень" — появляется когда тащим не-корневой */}
      {draggedId !== null && canDropToRoot && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setRootDragOver(true);
          }}
          onDragLeave={() => setRootDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setRootDragOver(false);
            onMove(draggedId!, null);
          }}
          className={`
            mt-2 flex items-center gap-2
            px-3 py-2 rounded-md border-2 border-dashed
            transition-colors text-sm select-none
            ${rootDragOver ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300" : "border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-600"}
          `}
        >
          <FolderOpen size={15} />
          Перенести в корень
        </div>
      )}
    </div>
  );
}

// import CategoryTreeNode from "./CategoryTreeNode";
// import { type TreeNode } from "./types";

// interface Props {
//   items: TreeNode[];
//   onEdit: (item: TreeNode) => void;
//   onDelete: (item: TreeNode) => void;
// }

// export default function CategoryTreeView({
//   items,
//   onEdit,
//   onDelete,
// }: Props) {
//   const roots = items.filter(
//     (x) => x.parent === null
//   );

//   return (
//     <div className="space-y-3">
//       {roots.map((root) => (
//         <CategoryTreeNode
//           key={root.id}
//           node={root}
//           allItems={items}
//           onEdit={onEdit}
//           onDelete={onDelete}
//         />
//       ))}
//     </div>
//   );
// }
