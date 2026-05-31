import { useEffect, useRef, useState } from 'react'
import { useChatHub } from '../../hooks/useChatHub'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import Loader from '../../components/ui/Loader'

export default function VideoChat() {
  const { getConnection, safeInvoke } = useChatHub()
  const user = useAuthStore(s => s.user)
  const { showToast } = useToastStore()

  // ── 🎥 STATE & REFS ──
  const [isSearching, setIsSearching] = useState(false)
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [isMicOn, setIsMicOn] = useState(true)
  const [isCamOn, setIsCamOn] = useState(true)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)

  // WebRTC Configuration (Google's free STUN server)
  const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

  // ── 1. CAMERA/MIC SETUP ──
  useEffect(() => {
    const startLocalVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        localStreamRef.current = stream
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
      } catch (err) {
        showToast({ type: 'error', title: 'Camera Error', message: 'Please allow camera & mic access.', duration: 5000 })
      }
    }
    startLocalVideo()

    return () => {
      // Component unmount par camera band karo
      localStreamRef.current?.getTracks().forEach(track => track.stop())
      peerConnectionRef.current?.close()
    }
  }, [])

  // ── 2. WEBRTC & SIGNALR LOGIC ──
  useEffect(() => {
    const connection = getConnection()
    if (!connection) return

    const setupPeerConnection = (pId: string) => {
      const pc = new RTCPeerConnection(configuration)
      peerConnectionRef.current = pc

      // Local tracks WebRTC me dalo
      localStreamRef.current?.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!)
      })

      // Jab saamne wale ka video aaye
      pc.ontrack = (event) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0]
      }

      // Network rasta (ICE) mile toh backend ko bhejo
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          safeInvoke('SendIceCandidate', pId, JSON.stringify(event.candidate))
        }
      }
      return pc
    }

    // 🟢 Event: Match Found!
    connection.on("MatchFound", async (roomId: string, pId: string, isInitiator: boolean) => {
      setIsSearching(false)
      setPartnerId(pId)
      const pc = setupPeerConnection(pId)

      if (isInitiator) {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        safeInvoke('SendWebRTCOffer', pId, JSON.stringify(offer))
      }
    })

    // 🟢 Event: Receive Offer
    connection.on("ReceiveOffer", async (callerId: string, sdpStr: string) => {
      if (peerConnectionRef.current) {
        const offer = JSON.parse(sdpStr)
        await peerConnectionRef.current.setRemoteDescription(offer)
        const answer = await peerConnectionRef.current.createAnswer()
        await peerConnectionRef.current.setLocalDescription(answer)
        safeInvoke('SendWebRTCAnswer', callerId, JSON.stringify(answer))
      }
    })

    // 🟢 Event: Receive Answer
    connection.on("ReceiveAnswer", async (pId: string, sdpStr: string) => {
      if (peerConnectionRef.current) {
        const answer = JSON.parse(sdpStr)
        await peerConnectionRef.current.setRemoteDescription(answer)
      }
    })

    // 🟢 Event: Receive ICE Candidate
    connection.on("ReceiveIceCandidate", async (pId: string, candidateStr: string) => {
      if (peerConnectionRef.current) {
        const candidate = JSON.parse(candidateStr)
        await peerConnectionRef.current.addIceCandidate(candidate)
      }
    })

    // 🔴 Event: Partner Skipped/Left
    connection.on("PartnerLeft", () => {
      showToast({ type: 'warning', title: 'Skipped', message: 'Partner left the chat.', duration: 2000 })
      handleStop()
    })

    return () => {
      connection.off("MatchFound")
      connection.off("ReceiveOffer")
      connection.off("ReceiveAnswer")
      connection.off("ReceiveIceCandidate")
      connection.off("PartnerLeft")
    }
  }, [getConnection])

  // ── 3. BUTTON CONTROLS ──
  const handleStartMatching = () => {
    setIsSearching(true)
    safeInvoke('StartAutoMatch')
  }

  const handleStop = () => {
    if (partnerId) safeInvoke('EndMatch', partnerId)
    setPartnerId(null)
    setIsSearching(false)
    peerConnectionRef.current?.close()
    peerConnectionRef.current = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
  }

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !isMicOn
        setIsMicOn(!isMicOn)
      }
    }
  }

  const toggleCam = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !isCamOn
        setIsCamOn(!isCamOn)
      }
    }
  }

  // ── 🎥 UI RENDER ──
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white relative overflow-hidden">
      
      {/* ── REMOTE VIDEO (Full Screen Back) ── */}
      <div className="absolute inset-0 bg-black flex items-center justify-center">
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          className={`w-full h-full object-cover ${!partnerId ? 'opacity-0' : 'opacity-100'} transition-opacity duration-500`} 
        />
        
        {/* Waiting State */}
        {!partnerId && isSearching && (
          <div className="flex flex-col items-center z-10">
            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-xl font-medium animate-pulse">Finding a random stranger...</p>
          </div>
        )}

        {/* Start Screen */}
        {!partnerId && !isSearching && (
          <div className="flex flex-col items-center z-10 text-center px-4">
            <div className="text-6xl mb-4">🌍</div>
            <h1 className="text-3xl font-bold mb-2">Auto-Match Video</h1>
            <p className="text-gray-400 mb-8 max-w-md">Meet new people instantly. Click start and we'll pair you with someone randomly.</p>
            <button 
              onClick={handleStartMatching}
              className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-full text-xl font-bold transition shadow-[0_0_20px_rgba(79,70,229,0.4)]"
            >
              Start Matching
            </button>
          </div>
        )}
      </div>

      {/* ── LOCAL VIDEO (Floating Bottom Right) ── */}
      <div className="absolute bottom-24 right-6 w-32 sm:w-48 aspect-[3/4] bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border-2 border-gray-800 z-20">
        <video 
          ref={localVideoRef} 
          autoPlay 
          playsInline 
          muted 
          className={`w-full h-full object-cover transform -scale-x-100 ${!isCamOn ? 'hidden' : ''}`} 
        />
        {!isCamOn && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-3xl">📷❌</div>
        )}
      </div>

      {/* ── CONTROLS (Bottom Bar) ── */}
      <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-center gap-4 z-30 pb-4">
        
        <button onClick={toggleMic} className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition ${isMicOn ? 'bg-gray-800 hover:bg-gray-700' : 'bg-red-600 hover:bg-red-500'}`}>
          {isMicOn ? '🎤' : '🔇'}
        </button>

        <button onClick={toggleCam} className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition ${isCamOn ? 'bg-gray-800 hover:bg-gray-700' : 'bg-red-600 hover:bg-red-500'}`}>
          {isCamOn ? '📹' : '📵'}
        </button>

        {partnerId ? (
          <button onClick={() => { handleStop(); handleStartMatching(); }} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-full font-bold transition flex items-center gap-2">
            ⏭️ Skip
          </button>
        ) : isSearching ? (
          <button onClick={handleStop} className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-full font-bold transition">
            Stop Searching
          </button>
        ) : null}

      </div>
    </div>
  )
}