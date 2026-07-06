import { useMemo, useRef } from "react";



interface Options<T> {
  search?: string;
  searchFields?: string[];
  filters?: ReadonlyArray<(item: T) => boolean>;
  filterKey?: unknown;
}

function getNestedValue(obj: any, path: string) {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

export function useTableFilter<T extends object>(
  items: T[],
  options: Options<T>,
) {
  const searchFieldsRef = useRef(options.searchFields);
  const filtersRef = useRef(options.filters);

  searchFieldsRef.current = options.searchFields;
  filtersRef.current = options.filters;

  return useMemo(() => {
    let result = items;

    filtersRef.current?.forEach((filter) => {
      result = result.filter(filter);
    });

    const searchFields = searchFieldsRef.current;

    if (options.search?.trim() && searchFields?.length) {
      // ✅ Разбиваем запрос на слова ("WHITE AK" → ["white", "ak"]) — каждое слово
      // должно точным вхождением подстроки найтись хоть в одном из searchFields
      // (не обязательно в одном и том же поле у каждого слова). Раньше искали весь
      // запрос целиком одной строкой в одном поле — "WHITE AK" не находило товар,
      // где "white" в названии, а "ak" в артикуле, хотя оба слова там реально есть.
      const tokens = options.search
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      result = result.filter((item) => {
        const haystack = searchFields
          .map((field) => String(getNestedValue(item, field) ?? "").toLowerCase())
          .join(" ");
        return tokens.every((token) => haystack.includes(token));
      });
    }

    return result;
  }, [items, options.search, options.filterKey]);
}
