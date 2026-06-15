const translitMap: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

export const slugify = (text: string): string => {
  return text
    .trim()
    .toLowerCase()
    .split("")
    .map((char) => translitMap[char] ?? char)
    .join("")
    .replace(/\s+/g, "_")        // пробелы -> _
    .replace(/[^a-z0-9_-]/g, "") // только a-z, 0-9, _, -
    .replace(/_+/g, "_")         // ___ -> _
    .replace(/-+/g, "-")         // --- -> -
    .replace(/^[-_]+/, "")       // убрать в начале
    .replace(/[-_]+$/, "")       // убрать в конце
    .slice(0, 100);              // ограничение длины
};