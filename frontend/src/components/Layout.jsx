import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-[#0a0a0a] p-6 flex flex-col min-h-screen aurora-bg">
        <div className="flex-1 relative z-10 page-enter">
          <Outlet />
        </div>
        <footer className="relative z-10 mt-auto pt-8 pb-4 text-center text-xs text-[#444] border-t border-[#1a1a2a]">
          Created by Ayushi Singh &middot; CG Automation &middot; <a href="https://media-plan-generator.onrender.com" className="text-[#5A54BD] hover:text-[#6BB3CD] transition-colors">Nova AI Suite</a>
        </footer>
      </main>
    </div>
  );
}
