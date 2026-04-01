import { useMemo } from 'react';
import { BarChart3, Hash, DollarSign, TrendingUp, Percent, Layers, Target } from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import KPITile from '../components/KPITile';
import { formatCurrency, formatPercent, formatNumber } from '../utils/formatters';

export default function Scorecard() {
  const { data } = useAnalysis();
  const sc = data?.scorecard || {};

  const decisionBreakdown = useMemo(() => {
    if (!sc.decision_breakdown) return [];
    return Object.entries(sc.decision_breakdown).map(([key, val]) => ({ label: key, count: val }));
  }, [sc]);

  const tierBreakdown = useMemo(() => {
    if (!sc.tier_breakdown) return [];
    return Object.entries(sc.tier_breakdown).map(([key, val]) => ({ label: `Tier ${key}`, count: val }));
  }, [sc]);

  const tierColors = { 'Tier 1': '#1E8449', 'Tier 2': '#2E74B5', 'Tier 3': '#E67E22', 'Tier 4': '#7F8C8D' };
  const decisionColors = { REPOST: '#2E74B5', 'KEEP RUNNING': '#1E8449', SKIP: '#7F8C8D' };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 size={20} className="text-[#2E74B5]" />
        <h2 className="text-xl font-bold text-white">Scorecard</h2>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <KPITile label="Total Runs" value={formatNumber(sc.total_runs)} icon={Hash} />
        <KPITile label="Combos" value={formatNumber(sc.total_combos)} icon={Layers} />
        <KPITile label="Total Spend" value={formatCurrency(sc.total_spend)} icon={DollarSign} />
        <KPITile label="Total GR" value={formatCurrency(sc.total_gr)} icon={TrendingUp} color={sc.total_gr >= 0 ? 'text-[#1E8449]' : 'text-[#C0392B]'} />
        <KPITile label="Total NR" value={formatCurrency(sc.total_nr)} icon={Target} color={sc.total_nr >= 0 ? 'text-[#1E8449]' : 'text-[#C0392B]'} />
        <KPITile label="Avg Profit %" value={formatPercent(sc.avg_profit_pct)} icon={Percent} color={sc.avg_profit_pct >= 0 ? 'text-[#1E8449]' : 'text-[#C0392B]'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Decision Breakdown */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Decision Breakdown</h3>
          <div className="space-y-3">
            {decisionBreakdown.map((item) => {
              const total = decisionBreakdown.reduce((s, d) => s + d.count, 0);
              const pct = total > 0 ? (item.count / total) * 100 : 0;
              const color = decisionColors[item.label] || '#7F8C8D';
              return (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-[#ccc]">{item.label}</span>
                    <span className="text-white font-semibold">{item.count} <span className="text-[#666] font-normal">({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div className="w-full h-2 bg-[#222] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
          {sc.trigger_counts && (
            <div className="mt-4 pt-4 border-t border-[#2a2a2a]">
              <h4 className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-2">Trigger Counts</h4>
              <div className="space-y-1">
                {Object.entries(sc.trigger_counts).map(([trigger, count]) => (
                  <div key={trigger} className="flex items-center justify-between text-xs">
                    <span className="text-[#999]">{trigger}</span>
                    <span className="text-white font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tier Breakdown */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Tier Breakdown</h3>
          <div className="space-y-3">
            {tierBreakdown.map((item) => {
              const total = tierBreakdown.reduce((s, t) => s + t.count, 0);
              const pct = total > 0 ? (item.count / total) * 100 : 0;
              const color = tierColors[item.label] || '#7F8C8D';
              return (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-[#ccc]">{item.label}</span>
                    <span className="text-white font-semibold">{item.count} <span className="text-[#666] font-normal">({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div className="w-full h-2 bg-[#222] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Multiplier Coverage */}
      {sc.multiplier_coverage && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5 mb-8">
          <h3 className="text-sm font-semibold text-white mb-4">Multiplier Coverage</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(sc.multiplier_coverage).map(([key, val]) => (
              <div key={key} className="text-center">
                <div className="text-2xl font-bold text-white">{typeof val === 'number' ? val : val}</div>
                <div className="text-xs text-[#666] mt-1 capitalize">{key.replace(/_/g, ' ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Frequency Summary */}
      {sc.frequency_summary && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Frequency Optimization Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(sc.frequency_summary).map(([key, val]) => (
              <div key={key} className="text-center">
                <div className="text-2xl font-bold text-white">{typeof val === 'number' ? formatNumber(val) : val}</div>
                <div className="text-xs text-[#666] mt-1 capitalize">{key.replace(/_/g, ' ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
