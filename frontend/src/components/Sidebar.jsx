import { NavLink, useNavigate } from 'react-router-dom';
import {
  Upload,
  LayoutDashboard,
  RefreshCw,
  AlertTriangle,
  PlayCircle,
  XCircle,
  Type,
  FolderOpen,
  Calendar,
  TrendingUp,
  MapPin,
  BarChart3,
  Activity,
  Download,
  LogOut,
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import { signOut } from '../utils/supabase';

const navItems = [
  { section: 'Analysis', items: [
    { path: '/action-plan', label: 'Daily Action Plan', icon: LayoutDashboard },
    { path: '/repost', label: 'All Repost', icon: RefreshCw },
    { path: '/conflicts', label: 'Location Conflicts', icon: AlertTriangle },
    { path: '/keep-running', label: 'Keep Running', icon: PlayCircle },
    { path: '/skip', label: 'Skip', icon: XCircle },
  ]},
  { section: 'Intelligence', items: [
    { path: '/titles', label: 'Title Analysis', icon: Type },
    { path: '/categories', label: 'Category Analysis', icon: FolderOpen },
    { path: '/best-day', label: 'Best Day Analysis', icon: Calendar },
    { path: '/frequency', label: 'Frequency Optimization', icon: TrendingUp },
    { path: '/multipliers', label: 'Location Multipliers', icon: MapPin },
    { path: '/trends', label: 'Trend Analysis', icon: Activity },
  ]},
  { section: 'Reports', items: [
    { path: '/scorecard', label: 'Scorecard', icon: BarChart3 },
    { path: '/download', label: 'Download Excel', icon: Download },
  ]},
];

export default function Sidebar({ user }) {
  const navigate = useNavigate();
  const { clearData } = useAnalysis();

  function handleNewUpload() {
    clearData();
    navigate('/upload');
  }

  async function handleSignOut() {
    await signOut();
    window.location.reload();
  }

  const displayName = user?.user_metadata?.full_name || user?.email || '';
  const avatarUrl = user?.user_metadata?.avatar_url || '';
  const initials = displayName
    ? displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <aside className="w-64 min-w-64 h-screen glass-strong flex flex-col border-r border-[rgba(90,84,189,0.12)]">
      {/* Logo */}
      <div className="p-5 border-b border-[rgba(90,84,189,0.1)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#5A54BD] to-[#6BB3CD] flex items-center justify-center">
            <span className="text-white font-bold text-sm">CG</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">CG Automation</h1>
            <p className="text-[10px] text-[#5A54BD]">Nova AI Suite</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-3">
        {navItems.map((group) => (
          <div key={group.section}>
            <div className="mt-4 mb-2 px-3 first:mt-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#5A54BD]/60">{group.section}</span>
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 mb-0.5 ${
                      isActive
                        ? 'bg-[#5A54BD]/15 text-[#8B86E0] font-medium shadow-[inset_2px_0_0_0_#5A54BD]'
                        : 'text-[#777] hover:text-[#ccc] hover:bg-white/[0.03]'
                    }`
                  }
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-[rgba(90,84,189,0.1)]">
        <button
          onClick={handleNewUpload}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#6BB3CD] hover:text-white hover:bg-[#6BB3CD]/10 transition-all duration-150 w-full"
        >
          <Upload size={15} />
          <span>New Upload</span>
        </button>
      </div>

      {/* User profile + sign out */}
      {user && (
        <div className="p-3 border-t border-[rgba(90,84,189,0.1)]">
          <div className="flex items-center gap-3 px-2">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#5A54BD]/30 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-[#8B86E0]">{initials}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{displayName}</p>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="text-[#666] hover:text-red-400 transition-colors flex-shrink-0"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
