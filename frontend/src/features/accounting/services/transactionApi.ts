// src/features/accounting/services/transactionApi.ts

import { api } from "../../../core/api/axiosInstance"

export type TransactionSide = 'debit' | 'credit'
export type JournalStatus   = 'draft' | 'posted'
export type MovementDirection = 'in' | 'out' | 'move'

export interface TransactionLine {
  id?:          number
  order?:       number
  side:         TransactionSide
  account:      number
  account_code?: string
  account_name?: string
  amount:       string
  // branch?: string
  subcontos:    Record<string, { id: number; name: string }>
}

export interface JournalEntry {
  id:               number
  number:           string
  date:             string
  debit_accounts?: string
  credit_accounts?: string
  status:           JournalStatus
  status_display:   string
  description:      string
  debit_total?:     string
  lines?:           TransactionLine[]
  created_by_name?: string
  created_at:       string
  // debit_subcontos?: string
  // credit_subcontos?: string
  branch?: number | null;        // ✅ добавить
  branch_name?: string | null; 
  debit_subconto1?: string
  debit_subconto2?: string
  debit_subconto3?: string

  credit_subconto1?: string
  credit_subconto2?: string
  credit_subconto3?: string
}

export interface JournalEntryPayload {
  number?:      string
  date?:        string
  branch?: number | null;
  description: string
  lines:       TransactionLine[]
}

export interface StockMovement {
  id:                 number
  warehouse:          number
  warehouse_name:     string
  warehouse_to?:      number
  warehouse_to_name?: string
  product:            number
  product_name:       string
  direction:          MovementDirection
  direction_display:  string
  quantity:           string
  cost_price:         string
  note:               string
  created_by_name?:   string
  created_at:         string
}

const BASE = '/accounting/journal-entries/'
const MOVE = '/accounting/stock-movements/'

export const transactionApi = {
  // Journal
  list:     (params?: Record<string, string>) =>
    api.get<JournalEntry[]>(BASE, { params }),

  retrieve: (id: number) =>
    api.get<JournalEntry>(`${BASE}${id}/`),

  create:   (data: JournalEntryPayload) =>
    api.post<JournalEntry>(BASE, data),

  update:   (id: number, data: JournalEntryPayload) =>
    api.put<JournalEntry>(`${BASE}${id}/`, data),

  post:     (id: number) =>
    api.post(`${BASE}${id}/post/`),

  unpost:   (id: number) =>
    api.post(`${BASE}${id}/unpost/`),

  delete:   (id: number) =>
    api.delete(`${BASE}${id}/`),

  // Stock movements
  movements: (params?: Record<string, string>) =>
    api.get<StockMovement[]>(MOVE, { params }),
}



export interface ClosedPeriod {
  id:             number
  date:           string
  warehouse:      number | null
  warehouse_name: string | null
  scope_display:  string
  closed_by?:     number
  closed_by_name?: string
  closed_at:      string
  note:           string
}

export interface UserScope {
  is_global:  boolean
  warehouses: { id: number; name: string }[]
  branches:   { id: number; name: string }[]
}
 

const J = '/accounting/journal-entries/'
const M = '/accounting/stock-movements/'
const C = '/accounting/closed-periods/'

export const journalApi = {
  list:     (params?: Record<string, string>) => api.get<JournalEntry[]>(J, { params }),
  retrieve: (id: number)                       => api.get<JournalEntry>(`${J}${id}/`),
  create:   (data: JournalEntryPayload)         => api.post<JournalEntry>(J, data),
  update:   (id: number, data: JournalEntryPayload) => api.put<JournalEntry>(`${J}${id}/`, data),
  post:     (id: number)                        => api.post(`${J}${id}/post/`),
  unpost:   (id: number)                        => api.post(`${J}${id}/unpost/`),
  delete:   (id: number)                        => api.delete(`${J}${id}/`),
}

export const movementApi = {
  list: (params?: Record<string, string>) => api.get<StockMovement[]>(M, { params }),
}

// export const closedPeriodApi = {
//   check: (date: string, params?: { branch?: number | null; warehouse?: number | null }) =>
//     api.get<{ date: string; is_closed: boolean }>(`${C}check/`, {
//       params: { date, ...params },
//     }),
 
//   list: (params?: Record<string, string>) =>
//     api.get<ClosedPeriod[]>(C, { params }),
 
//   close: (date: string, options?: { branch?: number | null; warehouse?: number | null; note?: string }) =>
//     api.post<ClosedPeriod>(C, {
//       date,
//       branch:    options?.branch    ?? null,
//       warehouse: options?.warehouse ?? null,
//       note:      options?.note      ?? '',
//     }),
 


// open: async (date: string, options?: { branch?: number | null; warehouse?: number | null }) => {
//     const params = {
//       date,
//       ...(options?.branch    ? { branch:    options.branch }    : {}),
//       ...(options?.warehouse ? { warehouse: options.warehouse } : {}),
//     }
//     // console.log('open params:', params)  // ← что уходит
//     const res = await api.get<ClosedPeriod[]>(C, { params })
//     // console.log('open response:', res.data)
//     const period = res.data[0] ?? (res.data as any).results?.[0]
//     if (period) await api.delete(`${C}${period.id}/`)
//   },
// }

export const closedPeriodApi = {
  check: (date: string, warehouse: number) =>
    api.get<{ date: string; is_closed: boolean }>(`${C}check/`, {
      params: { date, warehouse },
    }),

  // Проверка "закрыты ли ВСЕ склады филиала" на дату — для инфо-текста,
  // когда выбран branch, но не выбран конкретный warehouse
  checkWarehouses: (date: string, warehouseIds: number[]) =>
    api.get<ClosedPeriod[]>(C, {
      params: { date, warehouse__in: warehouseIds.join(',') },
    }),

  close: (date: string, warehouse: number, note?: string) =>
    api.post<ClosedPeriod>(C, { date, warehouse, note: note ?? '' }),

  reopen: (id: number) =>
    api.delete(`${C}${id}/`),
}


export const userScopeApi = {
  getMyScope: () => api.get<UserScope>('/users/my-scope/'),
}