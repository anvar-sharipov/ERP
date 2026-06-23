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
  id:              number
  date:            string
  closed_by?:      number
  closed_by_name?: string
  closed_at:       string
  note:            string
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

export const closedPeriodApi = {
  check: (date: string) =>
    api.get<{ date: string; is_closed: boolean }>(`${C}check/`, { params: { date } }),

  list: (params?: Record<string, string>) =>
    api.get<ClosedPeriod[]>(C, { params }),

  close: (date: string, note = '') =>
    api.post<ClosedPeriod>(C, { date, note }),

  open: async (date: string) => {
    const res = await api.get<ClosedPeriod[]>(C, { params: { date } })
    const period = res.data.find(p => p.date === date)
    if (period) await api.delete(`${C}${period.id}/`)
  },
}