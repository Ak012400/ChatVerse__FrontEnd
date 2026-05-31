import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PrimarySidebar from './Sidebar/PrimarySidebar';
import SecondarySidebar from './Sidebar/SecondarySidebar';
import ChatSidebar from './Sidebar/ChatSidebar';
import VideoSidebar from './Sidebar/VideoSidebar';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<'chat' | 'video'>('chat');
  const navigate = useNavigate();
  const { slug } = useParams();
  const rooms = useChatStore((s) => s.rooms);
  const user = useAuthStore((s) => s.user);

  return (
    <div className="flex h-screen bg-gray-900">
      <PrimarySidebar activeTab={activeTab} setActiveTab={setActiveTab} user={user} />
      
      <SecondarySidebar>
        {activeTab === 'chat' ? (
          <ChatSidebar rooms={rooms} slug={slug} navigate={navigate} />
        ) : (
          <VideoSidebar />
        )}
      </SecondarySidebar>
      
      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}