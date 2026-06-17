import { useMemo } from "react";

interface Options<T> {
  search?: string;
  searchFields?: (keyof T)[];
  filters?: ReadonlyArray<(item: T) => boolean>;
}

export function useTableFilter<T extends object>(
  items: T[],
  options: Options<T>,
) {
  return useMemo(() => {
    let result = [...items];

    const searchFields = options.searchFields;

    if (options.search?.trim() && searchFields?.length) {
      const q = options.search.toLowerCase();

      result = result.filter((item) =>
        searchFields.some((field) =>
          String(item[field] ?? "")
            .toLowerCase()
            .includes(q),
        ),
      );
    }

    options.filters?.forEach((filter) => {
      result = result.filter(filter);
    });

    return result;
  }, [
    items,
    options.search,
    options.searchFields,
    options.filters,
  ]);
}