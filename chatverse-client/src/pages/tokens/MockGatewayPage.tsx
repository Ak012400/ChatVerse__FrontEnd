import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Lock, Shield, CreditCard, X } from 'lucide-react'

import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Loader from '../../components/ui/Loader'
import { useToastStore } from '../../stores/toastStore'
import { useTokensHub } from '../../hooks/useTokensHub'
import { useTokensStore } from '../../stores/tokensStore'
import type { TopupOrder } from '../../types/tokens'

// ============================================================
//  /tokens/mock-gateway?orderId=...&ref=...
//
//  Faux checkout that visually mimics a real payment gateway
//  (card form, "Pay ₹X" button, lock icons, "secure" copy).
//  The form fields don't actually validate or submit anywhere —
//  clicking Pay fires a 1.5-second "processing" spinner, then
//  calls our backend ConfirmMockPayment hub method which credits
//  the tokens through the ledger.
//
//  To swap for a real Razorpay flow later:
//    1. Drop this page; the backend's gatewayRedirectUrl will
//       point at Razorpay's hosted checkout instead.
//    2. Add a webhook controller that calls IPaymentGateway.
//       ConfirmAsync after signature verification.
//    3. The rest of the system (ledger, balance push, hub) is
//       already real-gateway-ready.
// ============================================================

export default function MockGatewayPage() {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const orderId  = search.get('orderId') ?? ''
  const refParam = search.get('ref') ?? ''

  const { showToast } = useToastStore()
  const { confirmMockPayment, getMyOrders, cancelTopupOrder } = useTokensHub()
  const { setOrders } = useTokensStore()

  const [order, setOrder] = useState<TopupOrder | null>(null)
  const [phase, setPhase] = useState<'form' | 'processing' | 'success' | 'failed'>('form')
  const [cardNo, setCardNo] = useState('4242 4242 4242 4242')
  const [cardName, setCardName] = useState('Test User')
  const [expiry, setExpiry] = useState('12/29')
  const [cvv, setCvv] = useState('123')

  // Pull the order details so we can show the amount + tokens.
  useEffect(() => {
    if (!orderId) {
      navigate('/tokens')
      return
    }
    getMyOrders().then((r) => {
      const found = r.orders.find((o) => o.id === orderId)
      if (!found) {
        showToast({ type: 'error', title: 'Order not found', message: 'Returning to wallet.', duration: 4000 })
        navigate('/tokens')
      } else {
        setOrder(found)
        if (found.status === 'succeeded') setPhase('success')
        if (found.status === 'cancelled' || found.status === 'failed') setPhase('failed')
      }
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  const amountMajor = useMemo(
    () => order ? (order.amountMinor / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—',
    [order],
  )

  const handlePay = async () => {
    if (!order) return
    setPhase('processing')
    // Visual delay so it feels like a real gateway round-trip.
    await new Promise((r) => setTimeout(r, 1500))
    try {
      const updated = await confirmMockPayment(order.id)
      setOrder(updated)
      setPhase('success')
      const fresh = await getMyOrders()
      setOrders(fresh.orders)
      // After a brief beat, head back to wallet.
      setTimeout(() => navigate('/tokens'), 1800)
    } catch (err: any) {
      setPhase('failed')
      showToast({ type: 'error', title: 'Payment failed', message: err?.message ?? 'Try again.', duration: 4000 })
    }
  }

  const handleCancel = async () => {
    if (!order) { navigate('/tokens'); return }
    try { await cancelTopupOrder(order.id) } catch { /* silent */ }
    navigate('/tokens')
  }

  return (
    <div className="min-h-screen flex items-start sm:items-center justify-center bg-[var(--color-bg)] p-4 sm:p-8">
      <div className="w-full max-w-md cv-fade-up">
        {/* Pseudo-gateway brand bar */}
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-fg)]">
            <Lock size={14} className="text-emerald-400" />
            <span>Mock Gateway · Secure</span>
          </div>
          <button
            onClick={handleCancel}
            className="cv-press w-8 h-8 inline-flex items-center justify-center rounded-md text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]"
            aria-label="Cancel"
          >
            <X size={14} />
          </button>
        </div>

        <Card glass padding="lg" className="cv-pop">
          {!order ? (
            <div className="flex justify-center py-10"><Loader /></div>
          ) : phase === 'success' ? (
            <SuccessState amount={amountMajor} tokens={order.tokenAmount} />
          ) : phase === 'failed' ? (
            <FailedState />
          ) : phase === 'processing' ? (
            <ProcessingState />
          ) : (
            <PaymentForm
              amount={amountMajor}
              tokens={order.tokenAmount}
              cardNo={cardNo} setCardNo={setCardNo}
              cardName={cardName} setCardName={setCardName}
              expiry={expiry} setExpiry={setExpiry}
              cvv={cvv} setCvv={setCvv}
              onPay={handlePay}
              onCancel={handleCancel}
            />
          )}
        </Card>

        <div className="flex items-center justify-center gap-1.5 mt-3 text-[10px] text-[var(--color-fg-faint)]">
          <Shield size={10} />
          <span>Test mode · no real money moves. ref: <span className="font-mono">{refParam.slice(0, 10) || '—'}</span></span>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-views ──────────────────────────────────────────────

function PaymentForm({
  amount, tokens,
  cardNo, setCardNo, cardName, setCardName, expiry, setExpiry, cvv, setCvv,
  onPay, onCancel,
}: {
  amount: string; tokens: number
  cardNo: string; setCardNo: (s: string) => void
  cardName: string; setCardName: (s: string) => void
  expiry: string; setExpiry: (s: string) => void
  cvv: string; setCvv: (s: string) => void
  onPay: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-faint)]">Pay</div>
        <div className="text-3xl font-semibold cv-text-gradient mt-1">₹{amount}</div>
        <div className="text-xs text-[var(--color-fg-dim)] mt-1">
          credits <span className="text-[var(--color-fg)] font-medium tabular-nums">{tokens.toLocaleString()}</span> tokens
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Field label="Card number" icon={<CreditCard size={14} />}>
          <input
            value={cardNo}
            onChange={(e) => setCardNo(e.target.value)}
            className="w-full h-10 rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg)] text-sm px-9 border border-[var(--color-line)] focus:outline-none focus:border-[var(--color-accent)] tabular-nums"
          />
        </Field>
        <Field label="Cardholder">
          <input
            value={cardName}
            onChange={(e) => setCardName(e.target.value)}
            className="w-full h-10 rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg)] text-sm px-3 border border-[var(--color-line)] focus:outline-none focus:border-[var(--color-accent)]"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Expiry">
            <input
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              placeholder="MM/YY"
              className="w-full h-10 rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg)] text-sm px-3 border border-[var(--color-line)] focus:outline-none focus:border-[var(--color-accent)] tabular-nums"
            />
          </Field>
          <Field label="CVV">
            <input
              value={cvv}
              onChange={(e) => setCvv(e.target.value)}
              type="password"
              maxLength={4}
              className="w-full h-10 rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg)] text-sm px-3 border border-[var(--color-line)] focus:outline-none focus:border-[var(--color-accent)] tabular-nums"
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <Button variant="primary" onClick={onPay} leftIcon={<Lock size={14} />}>
          Pay ₹{amount}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>

      <p className="text-[10px] text-center text-[var(--color-fg-faint)]">
        Card details are not validated or transmitted anywhere. Any input passes.
      </p>
    </div>
  )
}

function ProcessingState() {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <Loader />
      <div className="text-sm text-[var(--color-fg-dim)]">Processing your payment…</div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">do not close this window</div>
    </div>
  )
}

function SuccessState({ amount, tokens }: { amount: string; tokens: number }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 cv-pop">
      <div className="w-12 h-12 rounded-full inline-flex items-center justify-center bg-emerald-500/15 text-emerald-300 cv-halo">
        <Lock size={22} />
      </div>
      <div className="text-lg font-semibold cv-text-gradient">Payment successful</div>
      <div className="text-sm text-[var(--color-fg-dim)]">
        ₹{amount} → <span className="text-[var(--color-fg)] font-medium tabular-nums">{tokens.toLocaleString()}</span> tokens credited.
      </div>
      <div className="text-[10px] text-[var(--color-fg-faint)]">Returning to wallet…</div>
    </div>
  )
}

function FailedState() {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <div className="w-12 h-12 rounded-full inline-flex items-center justify-center bg-rose-500/15 text-rose-300">
        <X size={22} />
      </div>
      <div className="text-lg font-semibold text-[var(--color-fg)]">Payment couldn\'t complete</div>
      <div className="text-sm text-[var(--color-fg-dim)]">Try again from the wallet.</div>
    </div>
  )
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1 block">{label}</label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-faint)] pointer-events-none">{icon}</span>}
        {children}
      </div>
    </div>
  )
}
