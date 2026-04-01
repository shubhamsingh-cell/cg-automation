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

  const decisionTotal = useMemo(() => decisionBreakdown.reduce((s, d) => s + d.count, 0), [decisionBreakdown]);
  const tierTotal = useMemo(() => tierBreakdown.reduce((s, t) => s + t.count, 0), [tierBreakdown]);

  const tierColors = { 'Tier 1': '#1E8449', 'Tier 2': '#5A54BD', 'Tier 3': '#E67E22', 'Tier 4': '#7F8C8D' };
  const decisionColors = { REPOST: '#5A54BD', 'KEEP RUNNING': '#1E8449', SKIP: '#7F8C8D' };

  const summaryText = useMemo(() => {
    const repostCount = sc.decision_breakdown?.REPOST || 0;
    const keepCount = sc.decision_breakdown?.['KEEP RUNNING'] || 0;
    const total = repostCount + keepCount;
    const nr = formatCurrency(sc.total_nr);
    return `${total} locations ready to post, ${nr} total NR expected`;
  }, [sc]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <BarChart3 size={20} className="text-[#5A54BD]" />
        <h2 className="text-xl font-bold text-white">Scorecard</h2>
      </div>

      {/* Summary sentence */}
      {sc.total_runs && (
        <p className="text-sm text-[#888] mb-6 ml-8">{summaryText}</p>
      )}

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
        <div className="glass rounded-xl p-5 gradient-border">
          <h3 className="text-sm font-semibold text-white mb-4">Decision Breakdown</h3>

          {/* Horizontal stacked bar */}
          {decisionTotal > 0 && (
            <div className="w-full h-6 rounded-full overflow-hidden flex mb-5">
              {decisionBreakdown.map((item) => {
                const pct = (item.count / decisionTotal) * 100;
                const color = decisionColors[item.label] || '#7F8C8D';
                return (
                  <div
                    key={item.label}
                    className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                    title={`${item.label}: ${item.count} (${pct.toFixed(0)}%)`}
                  />
                );
              })}
            </div>
          )}

          <div className="space-y-3">
            {decisionBreakdown.map((item) => {
              const pct = decisionTotal > 0 ? (item.count / decisionTotal) * 100 : 0;
              const color = decisionColors[item.label] || '#7F8C8D';
              return (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
                    <span className="text-[#ccc]">{item.label}</span>
                  </div>
                  <span className="text-white font-semibold">{item.count} <span className="text-[#555] font-normal">({pct.toFixed(0)}%)</span></span>
                </div>
              );
            })}
          </div>
          {sc.trigger_counts && (
            <div className="mt-4 pt-4 border-t border-[rgba(90,84,189,0.1)]">
              <h4 className="text-xs font-semibold text-[#5A54BD]/50 uppercase tracking-wider mb-2">Trigger Counts</h4>
              <div className="space-y-1">
                {Object.entries(sc.trigger_counts).map(([trigger, count]) => (
                  <div key={trigger} className="flex items-center justify-between text-xs">
                    <span className="text-[#888]">{trigger}</span>
                    <span className="text-white font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tier Breakdown */}
        <div className="glass rounded-xl p-5 gradient-border">
          <h3 className="text-sm font-semibold text-white mb-4">Tier Breakdown</h3>

          {/* Horizontal stacked bar */}
          {tierTotal > 0 && (
            <div className="w-full h-6 rounded-full overflow-hidden flex mb-5">
              {tierBreakdown.map((item) => {
                const pct = (item.count / tierTotal) * 100;
                const color = tierColors[item.label] || '#7F8C8D';
                return (
                  <div
                    key={item.label}
                    className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                    title={`${item.label}: ${item.count} (${pct.toFixed(0)}%)`}
                  />
                );
              })}
            </div>
          )}

          <div className="space-y-3">
            {tierBreakdown.map((item) => {
              const pct = tierTotal > 0 ? (item.count / tierTotal) * 100 : 0;
              const color = tierColors[item.label] || '#7F8C8D';
              return (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
                    <span className="text-[#ccc]">{item.label}</span>
                  </div>
                  <span className="text-white font-semibold">{item.count} <span className="text-[#555] font-normal">({pct.toFixed(0)}%)</span></span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Multiplier Coverage */}
      {sc.multiplier_coverage && (
        <div className="glass rounded-xl p-5 mb-8 gradient-border">
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
        <div className="glass rounded-xl p-5 gradient-border">
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
