import { create } from 'zustand'
import type { TokenBalance, LedgerEntry, TopupOrder, TokenPack } from '../types/tokens'

interface TokensState {
  balance:    TokenBalance | null
  ledger:     LedgerEntry[]
  orders:     TopupOrder[]
  packs:      TokenPack[]
  currency:   string
  gateway:    string
  loaded:     boolean

  setBalance:    (b: TokenBalance) => void
  setLedger:     (l: LedgerEntry[]) => void
  prependLedger: (e: LedgerEntry) => void
  setOrders:     (o: TopupOrder[]) => void
  upsertOrder:   (o: TopupOrder) => void
  setPacks:      (p: TokenPack[], currency: string, gateway: string) => void
  applyBalanceChange: (newBalance: number) => void
  markLoaded:    () => void
}

export const useTokensStore = create<TokensState>((set) => ({
  balance:  null,
  ledger:   [],
  orders:   [],
  packs:    [],
  currency: 'INR',
  gateway:  'mock',
  loaded:   false,

  setBalance: (b) => set(() => ({ balance: b })),
  setLedger:  (l) => set(() => ({ ledger: l })),
  prependLedger: (e) =>
    set((s) => {
      if (s.ledger.some((x) => x.id === e.id)) return {}
      return { ledger: [e, ...s.ledger].slice(0, 100) }
    }),
  setOrders:  (o) => set(() => ({ orders: o })),
  upsertOrder: (o) =>
    set((s) => {
      const idx = s.orders.findIndex((x) => x.id === o.id)
      if (idx < 0) return { orders: [o, ...s.orders] }
      const next = [...s.orders]
      next[idx] = o
      return { orders: next }
    }),
  setPacks:   (p, currency, gateway) => set(() => ({ packs: p, currency, gateway })),

  applyBalanceChange: (newBalance) =>
    set((s) => s.balance
      ? { balance: { ...s.balance, balance: newBalance } }
      : { balance: { balance: newBalance, lifetimeCredited: 0, lifetimeDebited: 0, signupBonusGrantedAt: null } }),

  markLoaded: () => set(() => ({ loaded: true })),
}))
