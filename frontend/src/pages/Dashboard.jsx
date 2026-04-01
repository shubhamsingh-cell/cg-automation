import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, MapPin, DollarSign, Target, Percent,
  ClipboardList, Brain, FileBarChart, Upload, ChevronRight,
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import KPITile from '../components/KPITile';
import TierBadge from '../components/TierBadge';
import {
  formatCurrency, formatPercent, formatNumber, nrColorClass, getTodayDayName,
} from '../utils/formatters';

const DECISION_COLORS = { REPOST: '#5A54BD', 'KEEP RUNNING': '#1E8449', SKIP: '#7F8C8D' };
const TIER_COLORS = { 1: '#1E8449', 2: '#5A54BD', 3: '#E67E22', 4: '#7F8C8D' };

export default function Dashboard() {
  const navigate = useNavigate();
  const { data } = useAnalysis();
  const sc = data?.scorecard || {};
  const today = getTodayDayName();

  // --- Decision breakdown ---
  const decisionItems = useMemo(() => {
    if (!sc.decision_breakdown) return [];
    return Object.entries(sc.decision_breakdown).map(([label, count]) => ({ label, count }));
  }, [sc.decision_breakdown]);

  const decisionTotal = useMemo(
    () => decisionItems.reduce((s, d) => s + d.count, 0),
    [decisionItems],
  );

  // --- Tier breakdown ---
  const tierItems = useMemo(() => {
    if (!sc.tier_breakdown) return [];
    return Object.entries(sc.tier_breakdown).map(([tier, count]) => ({ tier: Number(tier), count }));
  }, [sc.tier_breakdown]);

  const tierTotal = useMemo(
    () => tierItems.reduce((s, t) => s + t.count, 0),
    [tierItems],
  );

  // --- Top 5 priority locations ---
  const priorities = useMemo(() => {
    if (!data?.daily_action_plan) return [];
    return data.daily_action_plan.slice(0, 5);
  }, [data?.daily_action_plan]);

  const locationCount = data?.daily_action_plan?.length || sc.total_combos || 0;
  const repostCount = data?.all_repost?.length || sc.decision_breakdown?.REPOST || 0;

  return (
    <div className="page-enter">
      {/* A. Header */}
      <div className="flex items-center gap-3 mb-1">
        <LayoutDashboard size={20} className="text-[#5A54BD]" />
        <h2 className="text-xl font-bold text-white">Dashboard</h2>
      </div>
      <p className="text-sm text-[#666] mb-6 ml-8">
        {today} &middot; {formatNumber(locationCount)} locations loaded
      </p>

      {/* B. KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KPITile
          label="Total Locations"
          value={formatNumber(sc.total_combos)}
          icon={MapPin}
        />
        <KPITile
          label="Total NR"
          value={formatCurrency(sc.total_nr)}
          icon={Target}
          color={nrColorClass(sc.total_nr) || 'text-white'}
        />
        <KPITile
          label="Total Spend"
          value={formatCurrency(sc.total_spend)}
          icon={DollarSign}
        />
        <KPITile
          label="Avg Profit %"
          value={formatPercent(sc.avg_profit_pct)}
          icon={Percent}
          color={sc.avg_profit_pct >= 0 ? 'text-[#1E8449]' : 'text-[#C0392B]'}
        />
      </div>

      {/* C. Decision + Tier side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Decision Breakdown */}
        <div className="glass rounded-xl p-5 gradient-border">
          <h3 className="text-sm font-semibold text-white mb-4">Decision Breakdown</h3>
          {decisionTotal > 0 && (
            <div className="w-full h-5 rounded-full overflow-hidden flex mb-4">
              {decisionItems.map((d) => {
                const pct = (d.count / decisionTotal) * 100;
                return (
                  <div
                    key={d.label}
                    className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: DECISION_COLORS[d.label] || '#7F8C8D' }}
                    title={`${d.label}: ${d.count} (${pct.toFixed(0)}%)`}
                  />
                );
              })}
            </div>
          )}
          <div className="space-y-2">
            {decisionItems.map((d) => {
              const pct = decisionTotal > 0 ? ((d.count / decisionTotal) * 100).toFixed(0) : 0;
              return (
                <div key={d.label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: DECISION_COLORS[d.label] || '#7F8C8D' }} />
                    <span className="text-[#ccc]">{d.label}</span>
                  </div>
                  <span className="text-white font-semibold">
                    {d.count} <span className="text-[#555] font-normal">({pct}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tier Breakdown */}
        <div className="glass rounded-xl p-5 gradient-border">
          <h3 className="text-sm font-semibold text-white mb-4">Tier Breakdown</h3>
          {tierTotal > 0 && (
            <div className="w-full h-5 rounded-full overflow-hidden flex mb-4">
              {tierItems.map((t) => {
                const pct = (t.count / tierTotal) * 100;
                return (
                  <div
                    key={t.tier}
                    className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: TIER_COLORS[t.tier] || '#7F8C8D' }}
                    title={`Tier ${t.tier}: ${t.count} (${pct.toFixed(0)}%)`}
                  />
                );
              })}
            </div>
          )}
          <div className="space-y-2">
            {tierItems.map((t) => {
              const pct = tierTotal > 0 ? ((t.count / tierTotal) * 100).toFixed(0) : 0;
              return (
                <div key={t.tier} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: TIER_COLORS[t.tier] || '#7F8C8D' }} />
                    <span className="text-[#ccc]">Tier {t.tier}</span>
                  </div>
                  <span className="text-white font-semibold">
                    {t.count} <span className="text-[#555] font-normal">({pct}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* D. Today's Priority */}
      {priorities.length > 0 && (
        <div className="glass rounded-xl p-5 gradient-border mb-8">
          <h3 className="text-sm font-semibold text-white mb-4">Today's Priority</h3>
          <div className="space-y-2">
            {priorities.map((row, i) => {
              const loc = row.location || row.Location || '';
              const title = row.recommended_title || row.Recommended_Title || '';
              const tier = row.tier || row.Tier;
              const nr = row.est_lifetime_nr ?? row.Est_Lifetime_NR;
              return (
                <div
                  key={`${loc}-${i}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer transition-colors group"
                  onClick={() => navigate(`/location/${encodeURIComponent(loc)}`)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-[#555] w-5 shrink-0">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">{loc}</div>
                      <div className="text-xs text-[#666] truncate">{title}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {tier != null && <TierBadge tier={tier} />}
                    <span className={`text-sm font-semibold ${nrColorClass(nr)}`}>
                      {formatCurrency(nr)}
                    </span>
                    <ChevronRight size={14} className="text-[#555] group-hover:text-[#5A54BD] transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* E. Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { to: '/action-plan', label: 'Action Plan', badge: repostCount, icon: ClipboardList },
          { to: '/intelligence', label: 'Intelligence', icon: Brain },
          { to: '/reports', label: 'Reports & Export', icon: FileBarChart },
          { to: '/upload', label: 'New Upload', icon: Upload },
        ].map((act) => (
          <button
            key={act.to}
            onClick={() => navigate(act.to)}
            className="glass rounded-xl p-4 gradient-border text-left hover:bg-white/[0.04] transition-colors group"
          >
            <div className="flex items-center gap-2 mb-2">
              <act.icon size={16} className="text-[#5A54BD]" />
              <span className="text-sm font-semibold text-white">{act.label}</span>
              {act.badge > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-[#5A54BD]/20 text-[#5A54BD] px-2 py-0.5 rounded-full">
                  {act.badge}
                </span>
              )}
            </div>
            <ChevronRight size={14} className="text-[#555] group-hover:text-[#5A54BD] transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}
