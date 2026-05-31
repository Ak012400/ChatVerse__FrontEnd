export default function ChatSidebar({ rooms, slug, navigate }: any) {
    const sections = ['General', 'Gaming', 'Tech', 'Fun'];
    
    return (
      <div className="space-y-6">
        {sections.map(section => (
          <div key={section}>
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">{section}</h3>
            <div className="space-y-1">
              {rooms.filter((r: any) => r.category === section.toLowerCase()).map((r: any) => (
                <button key={r.slug} onClick={() => navigate(`/chat/${r.slug}`)} 
                  className={`w-full px-3 py-2 rounded-lg text-sm ${slug === r.slug ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-900'}`}>
                  # {r.displayName}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }