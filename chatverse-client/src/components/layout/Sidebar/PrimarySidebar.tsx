export default function PrimarySidebar({ activeTab, setActiveTab, user }: any) {
    return (
      <div className="w-20 bg-gray-900 flex flex-col items-center py-6 gap-6 h-screen border-r border-gray-800">
        <div className="w-12 h-12 bg-indigo-600 rounded-xl mb-4 shadow-lg shadow-indigo-500/20"></div>
        
        {/* User Score & Nav */}
        <div className="text-center">
          <p className="text-[10px] text-gray-400">Score: {user?.trustScore ?? 100}</p>
        </div>
  
        <button onClick={() => setActiveTab('chat')} className={`text-2xl ${activeTab === 'chat' ? 'text-indigo-400' : 'text-gray-500'}`}>💬</button>
        <button onClick={() => setActiveTab('video')} className={`text-2xl ${activeTab === 'video' ? 'text-indigo-400' : 'text-gray-500'}`}>📹</button>
        <button className="text-2xl text-gray-500">⚙️</button>
      </div>
    );
  }