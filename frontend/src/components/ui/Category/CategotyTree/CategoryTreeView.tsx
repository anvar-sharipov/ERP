import CategoryTreeNode from "./CategoryTreeNode";
import { type TreeNode } from "./types";

// interface TreeNode {
//   id: number;
//   name: string;
//   parent: number | null;
//   is_active?: boolean;
// }

interface Props {
  items: TreeNode[];
  onEdit: (item: TreeNode) => void;
  onDelete: (item: TreeNode) => void;
}

export default function CategoryTreeView({
  items,
  onEdit,
  onDelete,
}: Props) {
  const roots = items.filter(
    (x) => x.parent === null
  );

  return (
    <div className="space-y-3">
      {roots.map((root) => (
        <CategoryTreeNode
          key={root.id}
          node={root}
          allItems={items}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}