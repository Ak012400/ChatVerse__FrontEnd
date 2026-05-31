import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../stores/authStore';

export default function VideoSidebar() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);

  const handleMode = (mode: string) => {
    const isBypass = import.meta.env.VITE_BYPASS_RESTRICTIONS === 'true';
    if (!isBypass && !user?.ageVerified) return alert("Age verification needed!");
    navigate(`/video/${mode}`);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-white font-bold mb-4">Video Modes</h2>
      {['1-on-1', 'Random', 'Group'].map(mode => (
        <button key={mode} onClick={() => handleMode(mode)} 
          className="w-full p-3 bg-gray-800 rounded-lg hover:bg-indigo-600 text-sm transition">
          {mode}
        </button>
      ))}
    </div>
  );
}