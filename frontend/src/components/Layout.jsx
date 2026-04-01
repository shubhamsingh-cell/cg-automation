import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout({ user }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header bar */}
        <header className="h-14 flex items-center justify-between px-6 border-b border-[rgba(90,84,189,0.1)] bg-[#0a0b14]/80 backdrop-blur-xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <a
              href="https://media-plan-generator.onrender.com"
              className="text-xs text-[#5A54BD] hover:text-[#6BB3CD] transition-colors flex items-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              Back to Nova
            </a>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-2">
                {user.user_metadata?.avatar_url ? (
                  <img src={user.user_metadata.avatar_url} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[#5A54BD]/30 flex items-center justify-center text-xs font-semibold text-[#8B86E0]">
                    {(user.user_metadata?.full_name || user.email || '?').split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                )}
                <span className="text-xs text-[#888] hidden md:block">{user.user_metadata?.full_name || user.email}</span>
              </div>
            )}
          </div>
        </header>
        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-[#0a0a0a] p-6 aurora-bg">
          <div className="relative z-10 page-enter max-w-[1400px] mx-auto">
            <Outlet />
          </div>
          <footer className="relative z-10 mt-8 pt-4 pb-4 text-center text-xs text-[#333] border-t border-[#1a1a2a]">
            Created by Ayushi Singh &middot; CG Automation &middot; <a href="https://media-plan-generator.onrender.com" className="text-[#5A54BD] hover:text-[#6BB3CD] transition-colors">Nova AI Suite</a>
          </footer>
        </main>
      </div>
    </div>
  );
}
