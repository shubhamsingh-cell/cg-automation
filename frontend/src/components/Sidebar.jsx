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
  Download,
  LogOut,
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';

const navItems = [
  { path: '/action-plan', label: 'Daily Action Plan', icon: LayoutDashboard },
  { path: '/repost', label: 'All Repost', icon: RefreshCw },
  { path: '/conflicts', label: 'Location Conflicts', icon: AlertTriangle },
  { path: '/keep-running', label: 'Keep Running', icon: PlayCircle },
  { path: '/skip', label: 'Skip', icon: XCircle },
  { divider: true, label: 'Intelligence' },
  { path: '/titles', label: 'Title Analysis', icon: Type },
  { path: '/categories', label: 'Category Analysis', icon: FolderOpen },
  { path: '/best-day', label: 'Best Day Analysis', icon: Calendar },
  { path: '/frequency', label: 'Frequency Optimization', icon: TrendingUp },
  { path: '/multipliers', label: 'Location Multipliers', icon: MapPin },
  { divider: true, label: 'Reports' },
  { path: '/scorecard', label: 'Scorecard', icon: BarChart3 },
  { path: '/download', label: 'Download Excel', icon: Download },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { clearData } = useAnalysis();

  function handleNewUpload() {
    clearData();
    navigate('/upload');
  }

  return (
    <aside className="w-64 min-w-64 h-screen bg-[#111111] border-r border-[#2a2a2a] flex flex-col">
      <div className="p-5 border-b border-[#2a2a2a]">
        <h1 className="text-lg font-bold text-white tracking-tight">CG Automation</h1>
        <p className="text-xs text-[#666] mt-0.5">Craigslist Posting Optimizer</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-3">
        {navItems.map((item, i) => {
          if (item.divider) {
            return (
              <div key={i} className="mt-4 mb-2 px-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#555]">{item.label}</span>
              </div>
            );
          }
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 ${
                  isActive
                    ? 'bg-[#2E74B5]/15 text-[#2E74B5] font-medium'
                    : 'text-[#999] hover:text-white hover:bg-[#1a1a1a]'
                }`
              }
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[#2a2a2a]">
        <button
          onClick={handleNewUpload}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#999] hover:text-white hover:bg-[#1a1a1a] transition-colors w-full"
        >
          <Upload size={16} />
          <span>New Upload</span>
        </button>
      </div>
    </aside>
  );
}
