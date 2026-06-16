import { type TreeNode } from "./types";




export const filterTreeItems = (
  items: TreeNode[],
  query: string
) => {
  if (!query.trim()) return items;

  const q = query.toLowerCase();

  const matched = items.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.slug?.toLowerCase().includes(q)
  );

  const ancestorIds = new Set<number>();

  matched.forEach((item) => {
    let current = item;

    while (current.parent) {
      ancestorIds.add(current.parent);

      const parent = items.find(
        (x) => x.id === current.parent
      );

      if (!parent) break;

      current = parent;
    }
  });

  return items.filter(
    (x) =>
      matched.includes(x) ||
      ancestorIds.has(x.id)
  );
};