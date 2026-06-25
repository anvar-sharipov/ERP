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
      const q = options.search.toLowerCase();

      result = result.filter((item) =>
        searchFields.some((field) => {
          const value = getNestedValue(item, field);

          return String(value ?? "")
            .toLowerCase()
            .includes(q);
        }),
      );
    }

    return result;
  }, [items, options.search, options.filterKey]);
}

// interface Options<T> {
//   search?: string;
//   searchFields?: (keyof T)[];
//   filters?: ReadonlyArray<(item: T) => boolean>;
//   filterKey?: unknown; // любое значение которое меняется при смене фильтра
// }

// export function useTableFilter<T extends object>(items: T[], options: Options<T>) {
//   // стабилизируем ссылки на массивы которые пересоздаются при каждом рендере
//   const searchFieldsRef = useRef(options.searchFields);
//   const filtersRef = useRef(options.filters);
//   searchFieldsRef.current = options.searchFields;
//   filtersRef.current = options.filters;

//   return useMemo(() => {
//   let result = items as T[];

//   // сначала фильтры (active/inactive) — сужаем выборку
//   filtersRef.current?.forEach((filter) => {
//     result = result.filter(filter);
//   });

//   // потом поиск по уже отфильтрованному
//   const searchFields = searchFieldsRef.current;
//   if (options.search?.trim() && searchFields?.length) {
//     const q = options.search.toLowerCase();
//     result = result.filter((item) =>
//       searchFields.some((field) =>
//         String(item[field] ?? "").toLowerCase().includes(q)
//       )
//     );
//   }

//   return result;
// }, [items, options.search, options.filterKey]);

// }





// import { useMemo } from "react";

// interface Options<T> {
//   search?: string;
//   searchFields?: (keyof T)[];
//   filters?: ReadonlyArray<(item: T) => boolean>;
// }

// export function useTableFilter<T extends object>(
//   items: T[],
//   options: Options<T>,
// ) {
//   return useMemo(() => {
//     let result = [...items];

//     const searchFields = options.searchFields;

//     if (options.search?.trim() && searchFields?.length) {
//       const q = options.search.toLowerCase();

//       result = result.filter((item) =>
//         searchFields.some((field) =>
//           String(item[field] ?? "")
//             .toLowerCase()
//             .includes(q),
//         ),
//       );
//     }

//     options.filters?.forEach((filter) => {
//       result = result.filter(filter);
//     });

//     return result;
//   }, [
//     items,
//     options.search,
//     options.searchFields,
//     options.filters,
//   ]);
// }