// frontend/src/core/utils/documentNumber.ts

export function shortDocumentNumber(number?: string | null): string {
  return number?.slice(-6) ?? "";
}

// export function shortDocumentNumber(number?: string | null): string {
//   if (!number) return "";

//   const idx = number.lastIndexOf("-");
//   if (idx === -1) return number;

//   return number.slice(idx + 1);
// }