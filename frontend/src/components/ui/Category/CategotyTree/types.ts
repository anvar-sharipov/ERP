// export interface TreeNode {
//   id: number;
//   name: string;
//   slug: string;
//   parent: number | null;
//   is_active?: boolean;
// }

export interface TreeNode {
  id: number;
  name: string;
  parent: number | null;
  is_active?: boolean;
  slug?: string;
  [key: string]: unknown;
}