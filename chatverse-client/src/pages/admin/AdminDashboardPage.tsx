import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ShieldCheck, AlertOctagon, FileCheck2, Users,
  Check, X, ExternalLink, Loader2,
} from 'lucide-react'
import { adminApi } from '../../api'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Avatar from '../../components/ui/Avatar'
import { useToastStore } from '../../stores/toastStore'

interface Stats {
  pendingReports: number
  pendingDocuments: number
  totalUsers: number
  ageVerifiedUsers: number
}

interface Report {
  reportId: string
  reporterId: string
  reportedId: string
  reason: string
  description: string | null
  status: string
  createdAt: string
  reporterName: string
  reportedName: string
}

interface DocRow {
  docId: string
  userId: string
  docType: string
  cloudinaryPublicId: string
  cloudinaryUrl: string
  status: string
  submittedAt: string
  username: string
}

type Tab = 'reports' | 'documents'

export default function AdminDashboardPage() {
  const navigate = useNavigate()
  const { showToast } = useToastStore()

  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [tab, setTab] = useState<Tab>('reports')
  const [reports, setReports] = useState<Report[]>([])
  const [docs, setDocs] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actionRow, setActionRow] = useState<string | null>(null)

  /* Gate */
  useEffect(() => {
    adminApi
      .whoami()
      .then((r) => setAllowed(!!r.data.data?.isAdmin))
      .catch(() => setAllowed(false))
  }, [])

  /* Load data once we know we're allowed */
  useEffect(() => {
    if (!allowed) return
    setLoading(true)
    Promise.all([
      adminApi.stats().catch(() => null),
      adminApi.reports('pending').catch(() => null),
      adminApi.documents('pending').catch(() => null),
    ])
      .then(([statsRes, reportsRes, docsRes]) => {
        if (statsRes) setStats(statsRes.data.data)
        if (reportsRes) setReports(reportsRes.data.data?.results ?? [])
        if (docsRes) setDocs(docsRes.data.data?.results ?? [])
      })
      .finally(() => setLoading(false))
  }, [allowed])

  const reviewReport = async (id: string, outcome: 'valid' | 'invalid' | 'dismissed') => {
    setActionRow(id)
    try {
      await adminApi.reviewReport(id, outcome)
      setReports((prev) => prev.filter((r) => r.reportId !== id))
      showToast({
        type: 'success',
        title: 'Report reviewed',
        message: `Marked ${outcome}`,
        duration: 2000,
      })
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Review failed',
        message: err.response?.data?.error ?? 'Try again',
        duration: 3000,
      })
    } finally {
      setActionRow(null)
    }
  }

  const reviewDoc = async (id: string, outcome: 'approve' | 'reject') => {
    setActionRow(id)
    try {
      const reason =
        outcome === 'reject'
          ? prompt('Reject reason (shown to the user):') ?? undefined
          : undefined
      await adminApi.reviewDocument(id, outcome, reason)
      setDocs((prev) => prev.filter((d) => d.docId !== id))
      showToast({
        type: 'success',
        title: `Document ${outcome === 'approve' ? 'approved' : 'rejected'}`,
        message: '',
        duration: 2000,
      })
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Review failed',
        message: err.response?.data?.error ?? 'Try again',
        duration: 3000,
      })
    } finally {
      setActionRow(null)
    }
  }

  /* Gate states */
  if (allowed === null) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-bg)] text-[var(--color-fg-faint)] text-sm">
        Checking access…
      </div>
    )
  }
  if (allowed === false) {
    return (
      <div className="h-full overflow-y-auto bg-[var(--color-bg)] text-[var(--color-fg)]">
        <div className="max-w-md mx-auto px-6 py-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-danger-soft)] border border-[rgba(239,68,68,0.3)] text-[var(--color-danger)] mb-4">
            <ShieldCheck size={22} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Not authorised</h1>
          <p className="text-sm text-[var(--color-fg-faint)] mb-6">
            Your account isn't on the admin allow-list.
          </p>
          <Button variant="subtle" onClick={() => navigate('/chat')}>
            Back to app
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <button
          onClick={() => navigate('/chat')}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] mb-6 transition-colors"
        >
          <ArrowLeft size={13} />
          Back to app
        </button>

        <div className="flex items-center gap-2.5 mb-6">
          <ShieldCheck size={20} className="text-[var(--color-accent-fg)]" />
          <h1 className="text-2xl font-semibold tracking-tight">Admin dashboard</h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard icon={AlertOctagon} label="Pending reports"   value={stats?.pendingReports}   tone="warning" />
          <StatCard icon={FileCheck2}   label="Pending docs"      value={stats?.pendingDocuments} tone="accent" />
          <StatCard icon={Users}        label="Registered users"   value={stats?.totalUsers}       tone="neutral" />
          <StatCard icon={ShieldCheck}  label="Age verified"       value={stats?.ageVerifiedUsers} tone="success" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[var(--color-line)] mb-4">
          <TabButton active={tab === 'reports'} onClick={() => setTab('reports')}>
            Reports ({reports.length})
          </TabButton>
          <TabButton active={tab === 'documents'} onClick={() => setTab('documents')}>
            Documents ({docs.length})
          </TabButton>
        </div>

        {loading ? (
          <div className="text-center py-12 text-[var(--color-fg-faint)] text-sm flex items-center justify-center gap-2">
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            Loading…
          </div>
        ) : tab === 'reports' ? (
          <ReportList
            reports={reports}
            actionRow={actionRow}
            onReview={reviewReport}
          />
        ) : (
          <DocList docs={docs} actionRow={actionRow} onReview={reviewDoc} />
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────── */

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof AlertOctagon
  label: string
  value: number | undefined
  tone: 'warning' | 'accent' | 'success' | 'neutral'
}) {
  const colors = {
    warning: 'text-[var(--color-warning)] bg-[var(--color-warning-soft)] border-[rgba(245,158,11,0.3)]',
    accent:  'text-[var(--color-accent-fg)] bg-[var(--color-accent-soft)] border-[rgba(99,102,241,0.3)]',
    success: 'text-[#86efac] bg-[var(--color-success-soft)] border-[rgba(34,197,94,0.3)]',
    neutral: 'text-[var(--color-fg-dim)] bg-[var(--color-surface-2)] border-[var(--color-line)]',
  }[tone]

  return (
    <Card padding="md">
      <div className="flex items-start gap-2.5">
        <span className={`w-9 h-9 rounded-md flex items-center justify-center border ${colors}`}>
          <Icon size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-[var(--color-fg-faint)] uppercase tracking-wider">
            {label}
          </p>
          <p className="text-xl font-semibold tabular-nums mt-0.5">
            {value !== undefined ? value : '—'}
          </p>
        </div>
      </div>
    </Card>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
        ${
          active
            ? 'border-[var(--color-accent)] text-[var(--color-fg)]'
            : 'border-transparent text-[var(--color-fg-faint)] hover:text-[var(--color-fg)]'
        }`}
    >
      {children}
    </button>
  )
}

function ReportList({
  reports,
  actionRow,
  onReview,
}: {
  reports: Report[]
  actionRow: string | null
  onReview: (id: string, outcome: 'valid' | 'invalid' | 'dismissed') => void
}) {
  if (reports.length === 0) {
    return (
      <Card padding="lg">
        <p className="text-sm text-[var(--color-fg-faint)] text-center py-4">
          No pending reports. 🎉
        </p>
      </Card>
    )
  }
  return (
    <div className="space-y-2">
      {reports.map((r) => {
        const busy = actionRow === r.reportId
        return (
          <Card key={r.reportId} padding="md">
            <div className="flex items-start gap-3">
              <Avatar name={r.reportedName} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-medium">{r.reportedName}</span>
                  <Badge tone="warning" size="sm">{r.reason}</Badge>
                  <span className="text-[11px] text-[var(--color-fg-faint)]">
                    reported by {r.reporterName}
                  </span>
                </div>
                {r.description && (
                  <p className="text-xs text-[var(--color-fg-dim)] leading-relaxed mb-2 italic">
                    "{r.description}"
                  </p>
                )}
                <p className="text-[10px] text-[var(--color-fg-mute)]">
                  {new Date(r.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onReview(r.reportId, 'invalid')}
                  loading={busy}
                  leftIcon={<X size={12} />}
                >
                  Invalid
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => onReview(r.reportId, 'valid')}
                  loading={busy}
                  leftIcon={<Check size={12} />}
                >
                  Valid
                </Button>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function DocList({
  docs,
  actionRow,
  onReview,
}: {
  docs: DocRow[]
  actionRow: string | null
  onReview: (id: string, outcome: 'approve' | 'reject') => void
}) {
  if (docs.length === 0) {
    return (
      <Card padding="lg">
        <p className="text-sm text-[var(--color-fg-faint)] text-center py-4">
          No pending document reviews. 🎉
        </p>
      </Card>
    )
  }
  return (
    <div className="space-y-2">
      {docs.map((d) => {
        const busy = actionRow === d.docId
        return (
          <Card key={d.docId} padding="md">
            <div className="flex items-start gap-3">
              <Avatar name={d.username} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-medium">{d.username}</span>
                  <Badge tone="accent" size="sm">{d.docType}</Badge>
                </div>
                <p className="text-[11px] text-[var(--color-fg-faint)] mb-2">
                  Submitted {new Date(d.submittedAt).toLocaleString()}
                </p>
                <a
                  href={d.cloudinaryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[var(--color-accent-fg)] hover:text-[var(--color-fg)] transition-colors"
                >
                  <ExternalLink size={11} />
                  Open document
                </a>
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onReview(d.docId, 'reject')}
                  loading={busy}
                  leftIcon={<X size={12} />}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => onReview(d.docId, 'approve')}
                  loading={busy}
                  leftIcon={<Check size={12} />}
                >
                  Approve
                </Button>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
