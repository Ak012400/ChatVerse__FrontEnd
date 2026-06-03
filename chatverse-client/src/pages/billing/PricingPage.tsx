import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Sparkles, Crown, Zap, AlertCircle } from 'lucide-react'
import { billingApi } from '../../api'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'

/* Razorpay loads via CDN — declare its global so TS is happy. */
declare global {
  interface Window {
    Razorpay?: new (options: any) => { open: () => void }
  }
}

const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js'

interface Plan {
  id: string
  name: string
  priceInr: number
  pricePaise: number
  features: string[]
}

const ICONS = {
  basic:  Sparkles,
  pro:    Zap,
  elite:  Crown,
} as const

const HIGHLIGHTS = {
  basic: { tone: 'neutral' as const, blurb: 'Start ad-free' },
  pro:   { tone: 'accent' as const,  blurb: 'Most popular' },
  elite: { tone: 'warning' as const, blurb: 'Power user' },
}

export default function PricingPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { showToast } = useToastStore()
  const [plans, setPlans] = useState<Plan[]>([])
  const [activePlan, setActivePlan] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkingOut, setCheckingOut] = useState<string | null>(null)
  const [scriptReady, setScriptReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Load plans + current sub */
  useEffect(() => {
    setLoading(true)
    Promise.all([
      billingApi.getPlans().catch(() => null),
      billingApi.getSubscription().catch(() => null),
    ])
      .then(([plansRes, subRes]) => {
        if (plansRes) setPlans(plansRes.data.data ?? [])
        if (subRes?.data?.data?.planType) setActivePlan(subRes.data.data.planType)
      })
      .finally(() => setLoading(false))
  }, [])

  /* Lazy-load Razorpay script */
  useEffect(() => {
    if (window.Razorpay) {
      setScriptReady(true)
      return
    }
    const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT}"]`)
    if (existing) {
      existing.addEventListener('load', () => setScriptReady(true))
      return
    }
    const s = document.createElement('script')
    s.src = RAZORPAY_SCRIPT
    s.async = true
    s.onload = () => setScriptReady(true)
    s.onerror = () => setError('Could not load Razorpay. Check your connection.')
    document.body.appendChild(s)
  }, [])

  const handleCheckout = async (planId: string) => {
    if (user?.isGuest) {
      showToast({
        type: 'info',
        title: 'Sign up first',
        message: 'Create an account before subscribing.',
        duration: 3500,
      })
      navigate('/register')
      return
    }
    if (!scriptReady || !window.Razorpay) {
      showToast({
        type: 'warning',
        title: 'Hang on',
        message: 'Payment library still loading. Try again in a second.',
        duration: 3000,
      })
      return
    }

    setCheckingOut(planId)
    setError(null)
    try {
      const orderRes = await billingApi.createOrder(planId)
      const order = orderRes.data.data

      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency || 'INR',
        name: 'ChatVerse',
        description: `${planId.charAt(0).toUpperCase() + planId.slice(1)} subscription`,
        theme: { color: '#6366f1' },
        prefill: {
          name: user?.username ?? '',
        },
        handler: async (response: any) => {
          try {
            await billingApi.verifyPayment({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            })
            showToast({
              type: 'success',
              title: 'Subscription active',
              message: `Welcome to ${planId}!`,
              duration: 4000,
            })
            setActivePlan(planId)
          } catch (err: any) {
            showToast({
              type: 'error',
              title: 'Verification failed',
              message: err.response?.data?.error ?? 'Please contact support.',
              duration: 5000,
            })
          } finally {
            setCheckingOut(null)
          }
        },
        modal: {
          ondismiss: () => setCheckingOut(null),
        },
      })
      rzp.open()
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Could not start checkout.')
      setCheckingOut(null)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-bg)] text-[var(--color-fg-faint)] text-sm">
        Loading plans…
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <button
          onClick={() => navigate('/profile')}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] mb-6 transition-colors"
        >
          <ArrowLeft size={13} />
          Back to profile
        </button>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold tracking-tight mb-2">Upgrade</h1>
          <p className="text-sm text-[var(--color-fg-faint)] max-w-md mx-auto">
            Unlock premium features, custom badges, and instant trust boosts.
          </p>
        </div>

        {error && (
          <div className="mb-6 max-w-md mx-auto flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--color-danger-soft)] border border-[rgba(239,68,68,0.3)] text-[#fca5a5] text-xs">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const Icon = ICONS[plan.id as keyof typeof ICONS] ?? Sparkles
            const highlight = HIGHLIGHTS[plan.id as keyof typeof HIGHLIGHTS]
            const isCurrent = activePlan === plan.id
            const isPro = plan.id === 'pro'

            return (
              <Card
                key={plan.id}
                padding="lg"
                className={`relative ${isPro ? 'border-[var(--color-accent)]' : ''}`}
              >
                {highlight && (
                  <div className="absolute -top-2.5 left-5">
                    <Badge tone={highlight.tone} size="sm">
                      {highlight.blurb}
                    </Badge>
                  </div>
                )}

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-md bg-[var(--color-surface-2)] text-[var(--color-accent-fg)] flex items-center justify-center">
                      <Icon size={16} />
                    </span>
                    <h3 className="text-lg font-semibold tracking-tight">{plan.name}</h3>
                  </div>
                </div>

                <div className="mb-5">
                  <span className="text-3xl font-semibold tabular-nums">₹{plan.priceInr}</span>
                  <span className="text-sm text-[var(--color-fg-faint)] ml-1">/ month</span>
                </div>

                <ul className="space-y-2 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-[var(--color-fg-dim)]">
                      <Check size={13} className="text-[#86efac] mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <Button fullWidth variant="subtle" disabled>
                    Current plan
                  </Button>
                ) : (
                  <Button
                    fullWidth
                    variant={isPro ? 'primary' : 'secondary'}
                    loading={checkingOut === plan.id}
                    onClick={() => handleCheckout(plan.id)}
                  >
                    {checkingOut === plan.id ? 'Opening Razorpay…' : `Choose ${plan.name}`}
                  </Button>
                )}
              </Card>
            )
          })}
        </div>

        <p className="mt-8 text-center text-xs text-[var(--color-fg-mute)] max-w-md mx-auto leading-relaxed">
          Payments are processed by Razorpay. We never see your card details. You can
          cancel any time — billing stops at the end of the period.
        </p>
      </div>
    </div>
  )
}
