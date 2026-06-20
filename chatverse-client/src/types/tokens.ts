// ============================================================
//  Token economy — client types
// ============================================================

export type TopupStatus = 'created' | 'pending' | 'succeeded' | 'failed' | 'cancelled'

export interface TokenBalance {
  balance:              number
  lifetimeCredited:     number
  lifetimeDebited:      number
  signupBonusGrantedAt: string | null
}

export interface SignupBonusResponse {
  granted:              boolean
  balance:              number
  signupBonusGrantedAt: string | null
}

export interface LedgerEntry {
  id:           string
  delta:        number
  balanceAfter: number
  reason:       string
  note:         string | null
  gatewayRef:   string | null
  createdAt:    string
}

export interface LedgerResponse { count: number; entries: LedgerEntry[] }

export interface TokenPack {
  key:         string
  title:       string
  amountMinor: number
  tokenAmount: number
  tagline:     string | null
}

export interface PacksResponse {
  currency:        string
  packs:           TokenPack[]
  gatewayProvider: string
}

export interface TopupOrder {
  id:                 string
  packKey:            string
  amountMinor:        number
  currency:           string
  tokenAmount:        number
  status:             TopupStatus
  gateway:            string
  gatewayRedirectUrl: string | null
  createdAt:          string
  completedAt:        string | null
}

export interface OrdersResponse { count: number; orders: TopupOrder[] }

// ── Server-push payload ───────────────────────────────────────

export interface BalanceChangedEvent { balance: number }
