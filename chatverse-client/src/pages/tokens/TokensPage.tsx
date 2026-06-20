import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Wallet, BookOpen, Sparkles, ArrowUp, ArrowDown, Plus, CheckCircle2, XCircle, Clock, Gift,
} from 'lucide-react'

import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Loader from '../../components/ui/Loader'
import { useToastStore } from '../../stores/toastStore'
import { useTokensStore } from '../../stores/tokensStore'
import { useTokensHub } from '../../hooks/useTokensHub'
import type { TokenPack, LedgerEntry } from '../../types/tokens'

// ============================================================
//  /tokens — wallet page
//
//  Sections (top → bottom):
//    1. Balance card (gradient + lifetime totals)
//    2. Top-up packs (click → kicks off mock gateway flow)
//    3. Recent ledger (last 30 entries with delta + reason chip)
//    4. Recent orders rail (any pending order surfaces a "Resume" CTA)
// ============================================================

const REASON_LABELS: Record<string, string> = {
  signup_bonus:  'Signup bonus',
  daily_login:   'Daily login',
  streak_bonus:  'Streak bonus',
  refer_friend:  'Referral',
  topup:         'Top-up',
  tip_sent:      'Tip sent',
  tip_received:  'Tip received',
  mehfil_entry:  'Mehfil entry',
  prize_pyaar:   'PYAAR LIVE prize',
  prize_cipher:  'Cipher prize',
  admin_grant:   'Admin grant',
  refund:        'Refund',
}

export default function TokensPage() {
  const navigate = useNavigate()
  const { showToast } = useToastStore()
  const {
    balance, ledger, orders, packs, currency, gateway,
    setBalance, setLedger, setOrders, setPacks,
  } = useTokensStore()
  const {
    isConnected,
    getBalance, getLedger, getPacks, getMyOrders, createTopupOrder, cancelTopupOrder,
  } = useTokensHub()

  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState<string | null>(null)   // packKey being processed

  useEffect(() => {
    if (!isConnected) return
    setLoading(true)
    Promise.all([getBalance(), getLedger(), getPacks(), getMyOrders()])
      .then(([b, l, p, o]) => {
        setBalance(b)
        setLedger(l.entries)
        setPacks(p.packs, p.currency, p.gatewayProvider)
        setOrders(o.orders)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected])

  const pendingOrders = useMemo(
    () => orders.filter((o) => o.status === 'created' || o.status === 'pending'),
    [orders],
  )

  const handleTopup = async (pack: TokenPack) => {
    if (creating) return
    setCreating(pack.key)
    try {
      const order = await createTopupOrder(pack.key)
      // Real-world: redirect to gateway hosted page. Mock world:
      // we open OUR fake gateway page at the URL the server returned.
      if (order.gatewayRedirectUrl) {
        navigate(order.gatewayRedirectUrl)
      } else {
        showToast({
          type: 'error', title: 'No redirect URL',
          message: 'Gateway didn\'t return a redirect — contact support.',
          duration: 5000,
        })
      }
    } catch (err: any) {
      showToast({
        type: 'error', title: 'Top-up failed',
        message: err?.message ?? 'Try again.', duration: 4000,
      })
    } finally { setCreating(null) }
  }

  const handleCancel = async (orderId: string) => {
    try {
      await cancelTopupOrder(orderId)
      const fresh = await getMyOrders()
      setOrders(fresh.orders)
    } catch { /* silent */ }
  }

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="max-w-2xl mx-auto cv-fade-up">
        <Header />

        {loading && !balance ? (
          <div className="flex justify-center py-12"><Loader /></div>
        ) : (
          <div className="flex flex-col gap-6">
            <BalanceCard balance={balance?.balance ?? 0} credited={balance?.lifetimeCredited ?? 0} debited={balance?.lifetimeDebited ?? 0} />

            {pendingOrders.length > 0 && (
              <PendingOrdersRail
                orders={pendingOrders}
                currency={currency}
                onResume={(o) => o.gatewayRedirectUrl && navigate(o.gatewayRedirectUrl)}
                onCancel={(o) => handleCancel(o.id)}
              />
            )}

            <PacksSection
              packs={packs}
              currency={currency}
              gateway={gateway}
              onTopup={handleTopup}
              creating={creating}
            />

            <LedgerSection entries={ledger} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Header ─────────────────────────────────────────────────

function Header() {
  return (
    <div className="cv-aurora rounded-2xl p-5 border border-[var(--color-line)] bg-[var(--color-surface-1)] mb-6">
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white cv-halo"
          style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #f59e0b 100%)' }}
        >
          <Wallet size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold leading-tight cv-text-gradient">Your wallet</h1>
          <p className="text-sm text-[var(--color-fg-dim)] mt-1">
            Spend tokens on Mehfil tips, prize pool entries, and more. New voyagers get 100 free on signup.
          </p>
          <Link
            to="/about#tokens"
            className="inline-flex items-center gap-1.5 mt-2 text-xs text-[var(--color-accent-fg)] hover:text-[var(--color-accent)] transition-colors"
          >
            <BookOpen size={12} />
            <span>How the wallet works</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Balance card ───────────────────────────────────────────

function BalanceCard({ balance, credited, debited }: { balance: number; credited: number; debited: number }) {
  return (
    <Card aurora padding="lg" className="cv-pop">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-faint)] font-medium">
        Available balance
      </div>
      <div className="mt-2 text-4xl sm:text-5xl font-semibold tabular-nums cv-text-gradient inline-flex items-baseline gap-2">
        {balance.toLocaleString()}
        <span className="text-base font-medium text-[var(--color-fg-dim)]">tokens</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="inline-flex items-center gap-1.5">
          <ArrowUp size={12} className="text-emerald-400" />
          <span className="text-[var(--color-fg-dim)]">Earned</span>
          <span className="tabular-nums text-[var(--color-fg)] font-medium">{credited.toLocaleString()}</span>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <ArrowDown size={12} className="text-rose-400" />
          <span className="text-[var(--color-fg-dim)]">Spent</span>
          <span className="tabular-nums text-[var(--color-fg)] font-medium">{debited.toLocaleString()}</span>
        </div>
      </div>
    </Card>
  )
}

// ─── Pending orders ─────────────────────────────────────────

function PendingOrdersRail({
  orders, currency, onResume, onCancel,
}: {
  orders: { id: string; packKey: string; amountMinor: number; status: string; gatewayRedirectUrl: string | null }[]
  currency: string
  onResume: (o: any) => void
  onCancel: (o: any) => void
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-2 inline-flex items-center gap-1.5">
        <Clock size={12} /> <span>Pending checkouts</span>
      </div>
      <div className="flex flex-col gap-2 cv-stagger">
        {orders.map((o) => (
          <Card key={o.id} padding="sm" className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-[var(--color-fg)]">{formatMoney(o.amountMinor, currency)}</div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">{o.status}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => onCancel(o)}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={() => onResume(o)}>Resume</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─── Packs ──────────────────────────────────────────────────

function PacksSection({
  packs, currency, gateway, onTopup, creating,
}: {
  packs: TokenPack[]
  currency: string
  gateway: string
  onTopup: (p: TokenPack) => void
  creating: string | null
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] inline-flex items-center gap-1.5">
          <Sparkles size={12} /> <span>Top up</span>
        </div>
        <span className="text-[10px] text-[var(--color-fg-faint)] uppercase tracking-wider">via {gateway === 'mock' ? 'Mock Gateway' : gateway}</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 cv-stagger">
        {packs.map((p) => (
          <Card key={p.key} padding="md" hover className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-[var(--color-fg)]">{p.title}</div>
              {p.tagline && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 h-4 rounded bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] font-medium inline-flex items-center">
                  {p.tagline}
                </span>
              )}
            </div>
            <div className="text-2xl font-semibold tabular-nums">{p.tokenAmount.toLocaleString()} <span className="text-sm font-medium text-[var(--color-fg-dim)]">tokens</span></div>
            <div className="text-xs text-[var(--color-fg-faint)] tabular-nums">{formatMoney(p.amountMinor, currency)}</div>
            <Button
              variant="primary" size="sm" className="mt-2"
              loading={creating === p.key}
              disabled={creating !== null && creating !== p.key}
              onClick={() => onTopup(p)}
              leftIcon={<Plus size={12} />}
            >
              Top up
            </Button>
          </Card>
        ))}
      </div>
      {gateway === 'mock' && (
        <p className="text-[10px] text-[var(--color-fg-faint)] mt-3">
          Currently using the mock payment gateway — no real money moves. The full lifecycle (order → gateway page → success callback → ledger credit) is wired exactly like a real Razorpay integration; swapping is a one-class change.
        </p>
      )}
    </div>
  )
}

// ─── Ledger ─────────────────────────────────────────────────

function LedgerSection({ entries }: { entries: LedgerEntry[] }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-2 inline-flex items-center gap-1.5">
        <Gift size={12} /> <span>Recent activity</span>
      </div>
      {entries.length === 0 ? (
        <Card padding="md" className="text-center text-sm text-[var(--color-fg-dim)]">
          No activity yet.
        </Card>
      ) : (
        <div className="flex flex-col gap-1.5 cv-stagger">
          {entries.map((e) => <LedgerRow key={e.id} e={e} />)}
        </div>
      )}
    </div>
  )
}

function LedgerRow({ e }: { e: LedgerEntry }) {
  const positive = e.delta > 0
  return (
    <Card padding="sm" className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className={`w-7 h-7 rounded-full inline-flex items-center justify-center shrink-0
          ${positive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
          {positive ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
        </div>
        <div>
          <div className="text-sm text-[var(--color-fg)]">
            {REASON_LABELS[e.reason] ?? e.reason}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">
            {new Date(e.createdAt).toLocaleString()}{e.note && ` · ${e.note}`}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className={`text-sm font-medium tabular-nums ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>
          {positive ? '+' : ''}{e.delta.toLocaleString()}
        </div>
        <div className="text-[10px] text-[var(--color-fg-faint)] tabular-nums">
          → {e.balanceAfter.toLocaleString()}
        </div>
      </div>
    </Card>
  )
}

// ─── Helpers ────────────────────────────────────────────────

function formatMoney(minor: number, currency: string): string {
  const major = minor / 100
  if (currency === 'INR') return `₹${major.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  return `${currency} ${major.toFixed(2)}`
}

// keep imports used
void CheckCircle2; void XCircle
