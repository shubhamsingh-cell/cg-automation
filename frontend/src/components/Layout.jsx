import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, Brain, Sparkles, BarChart3, Upload, LogOut, ChevronLeft } from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import { signOut } from '../utils/supabase';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/action-plan', label: 'Action Plan', icon: ClipboardList },
  { path: '/intelligence', label: 'Intelligence', icon: Brain },
  { path: '/predictor', label: 'Predictor', icon: Sparkles },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
];

export default function Layout({ user }) {
  const navigate = useNavigate();
  const { clearData, data } = useAnalysis();
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => {
      setTime(new Date().toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  function handleNewUpload() {
    clearData();
    navigate('/upload');
  }

  async function handleSignOut() {
    await signOut();
    window.location.reload();
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0a0a0a]">
      {/* ---- Header ---- */}
      <header className="h-14 flex items-center justify-between px-5 border-b border-[rgba(255,255,255,0.06)] bg-[#0a0b14]/90 backdrop-blur-xl flex-shrink-0">
        {/* Left: Hub link + logo + product name */}
        <div className="flex items-center gap-4">
          <a
            href="https://media-plan-generator.onrender.com/hub"
            className="text-[#888] hover:text-white text-xs font-medium transition-colors flex items-center gap-1"
          >
            <ChevronLeft size={14} />
            Hub
          </a>
          <div className="w-px h-6 bg-[rgba(255,255,255,0.08)]" />
          {/* CG Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6BB3CD, #5A54BD)' }}>
              <span className="text-white text-xs font-bold tracking-tight">CG</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight leading-none">CG Automation</h1>
              <p className="text-[10px] text-[#666] leading-none mt-0.5">Craigslist Posting Optimizer</p>
            </div>
          </div>
        </div>

        {/* Right: IST clock + badge + user */}
        <div className="flex items-center gap-4">
          {time && (
            <div className="text-xs text-[#666] font-mono tabular-nums">
              {time} <span className="text-[#555]">IST</span>
            </div>
          )}
          <div className="px-2.5 py-1 rounded-md bg-[#6BB3CD]/10 border border-[#6BB3CD]/20">
            <span className="text-[10px] font-bold text-[#6BB3CD] tracking-wider">PRODUCT #5</span>
          </div>
          {user && (
            <div className="flex items-center gap-2">
              {user.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#5A54BD]/30 flex items-center justify-center text-xs font-semibold text-[#8B86E0]">
                  {(user.user_metadata?.full_name || user.email || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className="text-xs text-[#888] hidden md:block">{user.user_metadata?.full_name || user.email}</span>
              <button
                onClick={handleSignOut}
                className="ml-1 p-1.5 rounded-lg text-[#555] hover:text-red-400 hover:bg-red-400/5 transition-all"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ---- Horizontal Tab Navigation ---- */}
      <nav className="flex items-center gap-1 px-5 border-b border-[rgba(255,255,255,0.06)] bg-[#0a0b14]/60 backdrop-blur-sm flex-shrink-0" role="tablist" aria-label="Main navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all duration-150 border-b-2 -mb-px ${
                  isActive
                    ? 'text-[#6BB3CD] border-[#6BB3CD]'
                    : 'text-[#666] border-transparent hover:text-[#ccc] hover:border-[rgba(255,255,255,0.1)]'
                }`
              }
              role="tab"
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
        <div className="flex-1" />
        <button
          onClick={handleNewUpload}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-[#6BB3CD] hover:text-white hover:bg-[#6BB3CD]/10 transition-all duration-150"
        >
          <Upload size={14} />
          New Upload
        </button>
      </nav>

      {/* ---- Main Content ---- */}
      <main className="flex-1 overflow-y-auto bg-[#0a0a0a] aurora-bg flex flex-col min-h-0">
        <div className="relative z-10 page-enter max-w-[1400px] mx-auto px-6 py-6 flex-1 w-full flex flex-col">
          <Outlet />
        </div>
        <footer className="relative z-10 mt-auto pt-4 pb-4 text-center text-xs text-[#333] border-t border-[#1a1a2a]">
          Created by Ayushi Singh &middot; CG Automation &middot; <a href="https://media-plan-generator.onrender.com" className="text-[#5A54BD] hover:text-[#6BB3CD] transition-colors">Nova AI Suite</a>
        </footer>
      </main>
    </div>
  );
}
