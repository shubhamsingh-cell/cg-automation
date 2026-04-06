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
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#0a0a0a' }}>
      {/* ---- Header (matches SlotOps: 56px, dark bg, bordered IST clock + product badge) ---- */}
      <header style={{ height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(10,11,20,0.95)', backdropFilter: 'blur(20px)', flexShrink: 0 }}>
        {/* Left: Hub + Logo + Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <a
            href="https://media-plan-generator.onrender.com/hub"
            style={{ color: '#71717a', fontSize: '0.8125rem', fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem', transition: 'color 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#71717a'}
          >
            <ChevronLeft size={16} />
            Hub
          </a>
          <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Logo -- matches SlotOps blue square icon */}
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #6BB3CD, #5A54BD)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'white', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '-0.02em' }}>CG</span>
            </div>
            <div>
              <h1 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'white', lineHeight: 1.2, letterSpacing: '-0.01em' }}>CG Automation</h1>
              <p style={{ fontSize: '0.6875rem', color: '#71717a', lineHeight: 1, marginTop: '2px' }}>Craigslist Posting Optimizer</p>
            </div>
          </div>
        </div>

        {/* Right: IST clock (bordered) + PRODUCT badge + user */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {time && (
            <div style={{ padding: '0.375rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(107,179,205,0.2)', background: 'rgba(107,179,205,0.05)' }}>
              <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#6BB3CD', fontWeight: 600, letterSpacing: '0.02em' }}>{time} IST</span>
            </div>
          )}
          <div style={{ padding: '0.375rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#a1a1aa', letterSpacing: '0.05em' }}>PRODUCT #5</span>
          </div>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {user.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%' }} referrerPolicy="no-referrer" />
              ) : (
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(90,84,189,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: 600, color: '#8B86E0' }}>
                  {(user.user_metadata?.full_name || user.email || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
              )}
              <span style={{ fontSize: '0.75rem', color: '#71717a' }} className="hidden md:block">{user.user_metadata?.full_name || user.email}</span>
              <button
                onClick={handleSignOut}
                style={{ marginLeft: '4px', padding: '6px', borderRadius: '6px', color: '#555', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; e.currentTarget.style.background = 'none'; }}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ---- Tab Navigation (matches SlotOps: icon + label, active underline, right-side upload btn) ---- */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(10,11,20,0.6)', backdropFilter: 'blur(8px)', flexShrink: 0 }} role="tablist" aria-label="Main navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.875rem 1rem',
                fontSize: '0.8125rem', fontWeight: 500,
                color: isActive ? '#6BB3CD' : '#71717a',
                borderBottom: isActive ? '2px solid #6BB3CD' : '2px solid transparent',
                marginBottom: '-1px',
                textDecoration: 'none',
                transition: 'color 0.15s, border-color 0.15s',
              })}
              role="tab"
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
        <div style={{ flex: 1 }} />
        <button
          onClick={handleNewUpload}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 500, color: '#6BB3CD', background: 'none', border: 'none', cursor: 'pointer', transition: 'all 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(107,179,205,0.08)'; e.currentTarget.style.color = 'white'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#6BB3CD'; }}
        >
          <Upload size={14} />
          New Upload
        </button>
      </nav>

      {/* ---- Main Content ---- */}
      <main style={{ flex: 1, overflowY: 'auto', background: '#0a0a0a', display: 'flex', flexDirection: 'column', minHeight: 0 }} className="aurora-bg">
        <div style={{ position: 'relative', zIndex: 10, maxWidth: '1400px', margin: '0 auto', padding: '1.5rem', flex: 1, width: '100%', display: 'flex', flexDirection: 'column' }} className="page-enter">
          <Outlet />
        </div>
        <footer style={{ position: 'relative', zIndex: 10, marginTop: 'auto', padding: '1rem 0', textAlign: 'center', fontSize: '0.75rem', color: '#333', borderTop: '1px solid #1a1a2a' }}>
          Created by Ayushi Singh &middot; CG Automation &middot; <a href="https://media-plan-generator.onrender.com" style={{ color: '#5A54BD', textDecoration: 'none', transition: 'color 0.2s' }}>Nova AI Suite</a>
        </footer>
      </main>
    </div>
  );
}
