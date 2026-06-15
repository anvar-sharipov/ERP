
export const iconFileName = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([a-zA-Z])(\d+)/g, "$1-$2")
    .toLowerCase();




//  converter text
//  Building2      -> building-2
// ShoppingBag    -> shopping-bag
// FileText       -> file-text
// ArrowUpRight   -> arrow-up-right
// CircleOff      -> circle-off
// BadgeCheck2    -> badge-check-2
