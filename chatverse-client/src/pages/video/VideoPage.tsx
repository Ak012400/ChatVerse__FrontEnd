import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

export default function VideoPage() {
  const navigate    = useNavigate()
  const user        = useAuthStore((s) => s.user)
  const ageVerified = user?.ageVerified ?? false

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">

      <div className="text-center mb-8">
        <span className="text-5xl">📹</span>
        <h1 className="mt-4 text-2xl font-bold text-white">Random Video Chat</h1>
        <p className="mt-2 text-gray-400">
          Meet new people face to face
        </p>
      </div>

      {!ageVerified ? (
        <div className="w-full max-w-sm bg-yellow-900/20 border border-yellow-800
                        rounded-xl p-6 text-center">
          <p className="text-yellow-400 font-medium mb-2">Age Verification Required</p>
          <p className="text-gray-400 text-sm mb-4">
            Video chat requires age verification to ensure a safe environment.
          </p>
          <button
            onClick={() => navigate('/profile')}
            className="px-6 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500
                       text-white font-medium transition"
          >
            Verify Age
          </button>
        </div>
      ) : (
        <div className="text-center text-gray-500">
          <p className="text-lg mb-2">🚧 Video chat coming soon</p>
          <p className="text-sm">WebRTC implementation in progress</p>
        </div>
      )}

      <button
        onClick={() => navigate('/chat')}
        className="mt-8 text-gray-600 hover:text-gray-400 text-sm transition"
      >
        ← Back to chat
      </button>

    </div>
  )
}
