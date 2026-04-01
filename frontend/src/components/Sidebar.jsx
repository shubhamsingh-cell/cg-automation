import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, Brain, BarChart3, Upload, LogOut } from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import { signOut } from '../utils/supabase';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/action-plan', label: 'Action Plan', icon: ClipboardList },
  { path: '/intelligence', label: 'Intelligence', icon: Brain },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
];

export default function Sidebar({ user }) {
  const navigate = useNavigate();
  const { clearData, data } = useAnalysis();

  function handleNewUpload() {
    clearData();
    navigate('/upload');
  }

  async function handleSignOut() {
    await signOut();
    window.location.reload();
  }

  return (
    <aside className="w-56 min-w-56 h-screen bg-[#0a0b14]/90 backdrop-blur-xl flex flex-col border-r border-[rgba(90,84,189,0.12)]">
      {/* Logo */}
      <div className="p-5 border-b border-[rgba(90,84,189,0.1)]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#5A54BD] to-[#6BB3CD] flex items-center justify-center shadow-lg shadow-[#5A54BD]/20">
            <span className="text-white font-bold text-sm">CG</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">CG Automation</h1>
            <p className="text-[10px] text-[#5A54BD]/70">Nova AI Suite</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3">
        <div className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                    isActive
                      ? 'bg-[#5A54BD]/15 text-[#8B86E0] font-medium shadow-[inset_3px_0_0_0_#5A54BD]'
                      : 'text-[#666] hover:text-[#ccc] hover:bg-white/[0.03]'
                  }`
                }
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* New Upload button */}
      <div className="px-3 pb-2">
        <button
          onClick={handleNewUpload}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[#6BB3CD] hover:text-white hover:bg-[#6BB3CD]/10 transition-all duration-150 w-full"
        >
          <Upload size={18} />
          <span>New Upload</span>
        </button>
      </div>

      {/* Sign out */}
      {user && (
        <div className="p-3 border-t border-[rgba(90,84,189,0.1)]">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[#555] hover:text-red-400 hover:bg-red-400/5 transition-all w-full"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </aside>
  );
}
