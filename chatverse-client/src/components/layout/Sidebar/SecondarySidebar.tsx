export default function SecondarySidebar({ activeTab, children }: any) {
    return (
      <div className="w-60 bg-gray-950 p-4 h-screen border-r border-gray-800 overflow-y-auto">
        {children}
      </div>
    );
  }