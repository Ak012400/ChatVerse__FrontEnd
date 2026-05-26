import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { trustApi, ageApi } from '../../api'
import { authApi } from '../../api/auth'
import type { TrustScore } from '../../types'

const BAND_COLORS: Record<string, string> = {
  new:        'text-gray-400',
  restricted: 'text-red-400',
  normal:     'text-blue-400',
  trusted:    'text-green-400',
  elite:      'text-yellow-400',
}

export default function ProfilePage() {
  const navigate             = useNavigate()
  const { user, clearAuth }  = useAuthStore()
  const [trust, setTrust]    = useState<TrustScore | null>(null)
  const [ageStatus, setAgeStatus] = useState<any>(null)

  useEffect(() => {
    trustApi.getScore().then((r) => setTrust(r.data.data))
    ageApi.getStatus().then((r) => setAgeStatus(r.data.data))
  }, [])

  const handleLogout = async () => {
    await authApi.logout().catch(() => {})
    clearAuth()
    navigate('/')
  }

  const trustPct = trust ? (trust.score / 100) * 100 : 0

  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-sm mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/chat')} className="text-gray-500 hover:text-white">
            ←
          </button>
          <h1 className="text-xl font-bold">Profile</h1>
        </div>

        {/* User card */}
        <div className="bg-gray-900 rounded-2xl p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-indigo-700 flex items-center
                          justify-center text-2xl font-bold mx-auto">
            {user?.username[0].toUpperCase()}
          </div>
          <h2 className="mt-3 text-lg font-semibold">{user?.username}</h2>
          {user?.isGuest && (
            <span className="text-xs text-yellow-500 bg-yellow-900/30 px-2 py-1 rounded-full">
              Guest Account
            </span>
          )}
        </div>

        {/* Trust score */}
        <div className="bg-gray-900 rounded-2xl p-6">
          <h3 className="text-sm text-gray-400 mb-3">Trust Score</h3>
          {trust ? (
            <>
              <div className="flex items-end gap-2 mb-3">
                <span className="text-4xl font-bold">{trust.score}</span>
                <span className={`text-sm font-medium mb-1 ${BAND_COLORS[trust.band]}`}>
                  {trust.bandLabel}
                </span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${trustPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-600">
                Score range 0–100. Higher score = more privileges.
              </p>
            </>
          ) : (
            <div className="text-gray-600 text-sm">Loading...</div>
          )}
        </div>

        {/* Age verification */}
        <div className="bg-gray-900 rounded-2xl p-6">
          <h3 className="text-sm text-gray-400 mb-4">Age Verification</h3>
          {ageStatus ? (
            <div className="space-y-3">
              {[
                { label: 'Email verified',     done: ageStatus.gates.gate1_emailVerified },
                { label: 'Age self-declared',  done: ageStatus.gates.gate2_selfDeclared },
                { label: 'AI assessment',      done: ageStatus.gates.gate3_aiPassed },
                { label: 'Tenure / Document',  done: ageStatus.gates.gate4a_tenureCleared || ageStatus.gates.gate4b_docStatus === 'approved' },
              ].map(({ label, done }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className={`text-lg ${done ? 'text-green-400' : 'text-gray-600'}`}>
                    {done ? '✓' : '○'}
                  </span>
                  <span className={`text-sm ${done ? 'text-gray-300' : 'text-gray-500'}`}>
                    {label}
                  </span>
                </div>
              ))}

              {ageStatus.ageVerified ? (
                <div className="mt-3 px-3 py-2 bg-green-900/30 border border-green-800
                                rounded-lg text-green-400 text-sm text-center">
                  ✓ Age Verified — Video chat unlocked
                </div>
              ) : (
                <div className="mt-3 px-3 py-2 bg-gray-800 rounded-lg
                                text-gray-400 text-sm text-center">
                  Complete all steps to unlock video chat
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-600 text-sm">Loading...</div>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-xl border border-gray-800 text-gray-400
                     hover:border-red-800 hover:text-red-400 font-medium transition"
        >
          Sign out
        </button>

      </div>
    </div>
  )
}
