import { useState } from 'react';
import { BarChart3, FileSpreadsheet, Download, CheckCircle2 } from 'lucide-react';
import posthog from 'posthog-js';
import { useAnalysis } from '../context/AnalysisContext';
import { getDownloadUrl } from '../utils/api';
import KPITile from '../components/KPITile';
import { formatCurrency, formatPercent, formatNumber } from '../utils/formatters';

const SHEETS = [
  { name: 'Daily Action Plan', desc: 'Ranked list of locations to post today' },
  { name: 'All Repost Candidates', desc: 'Full repost list with triggers' },
  { name: 'Best Per Location', desc: '1 winner per location' },
  { name: 'Location Conflicts', desc: 'Filtered combos showing what beat what' },
  { name: 'Keep Running', desc: 'Healthy profitable posts' },
  { name: 'Skip', desc: 'Skipped combos with reason per row' },
  { name: 'Location Intelligence', desc: 'Best title/category/day picks per location' },
  { name: 'Frequency Optimization', desc: 'NR curves per combo' },
  { name: 'All Runs', desc: 'Complete historical run data' },
];

const DECISION_COLORS = { REPOST: '#5A54BD', 'KEEP RUNNING': '#1E8449', SKIP: '#7F8C8D' };
const TIER_COLORS = { 1: '#1E8449', 2: '#5A54BD', 3: '#E67E22', 4: '#7F8C8D' };

function BreakdownBar({ label, count, total, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-xs font-medium text-[#ccc] w-28 shrink-0">{label}</span>
      <div className="flex-1 bg-white/5 h-2 rounded-full overflow-hidden">
        <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs text-white font-semibold w-10 text-right">{formatNumber(count)}</span>
      <span className="text-xs text-[#888] w-12 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}

export default function Reports() {
  const { data, jobId } = useAnalysis();
  const [downloaded, setDownloaded] = useState(false);
  const sc = data?.scorecard || {};

  const valColor = (v) => (v == null ? 'text-white' : v >= 0 ? 'text-[#1E8449]' : 'text-[#C0392B]');
  const decisionTotal = Object.values(sc.decision_breakdown || {}).reduce((a, b) => a + b, 0);
  const tierTotal = Object.values(sc.tier_breakdown || {}).reduce((a, b) => a + b, 0);

  const handleDownload = () => {
    if (!jobId) return;
    posthog.capture('report_downloaded', { job_id: jobId });
    window.open(getDownloadUrl(jobId), '_blank');
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  };

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-[#888]">
        <BarChart3 size={48} className="mb-4 opacity-30" />
        <p className="text-lg">No analysis data yet. Upload a file to generate reports.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* A. Page Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <BarChart3 size={24} className="text-[#5A54BD]" />
          <h1 className="text-2xl font-bold text-white">Reports</h1>
        </div>
        <p className="text-sm text-[#888]">
          {formatNumber(sc.total_runs)} runs across {formatNumber(sc.total_combos)} combos
          &mdash; {formatCurrency(sc.total_spend)} total spend
        </p>
      </div>

      {/* B. KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPITile label="Total Runs" value={formatNumber(sc.total_runs)} icon={BarChart3} />
        <KPITile label="Combos" value={formatNumber(sc.total_combos)} icon={BarChart3} />
        <KPITile label="Total Spend" value={formatCurrency(sc.total_spend)} icon={BarChart3} />
        <KPITile label="Total GR" value={formatCurrency(sc.total_gr)} icon={BarChart3} color={valColor(sc.total_gr)} />
        <KPITile label="Total NR" value={formatCurrency(sc.total_nr)} icon={BarChart3} color={valColor(sc.total_nr)} />
        <KPITile label="Avg Profit %" value={formatPercent(sc.avg_profit_pct)} icon={BarChart3} color={valColor(sc.avg_profit_pct)} />
      </div>

      {/* C. Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Decision Breakdown */}
        <div className="glass rounded-xl p-5 gradient-border">
          <h2 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">Decision Breakdown</h2>
          {Object.entries(DECISION_COLORS).map(([key, color]) => (
            <BreakdownBar key={key} label={key} count={(sc.decision_breakdown || {})[key] || 0} total={decisionTotal} color={color} />
          ))}
        </div>

        {/* Tier Breakdown */}
        <div className="glass rounded-xl p-5 gradient-border">
          <h2 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">Tier Breakdown</h2>
          {Object.entries(TIER_COLORS).map(([tier, color]) => (
            <BreakdownBar key={tier} label={`Tier ${tier}`} count={(sc.tier_breakdown || {})[tier] || 0} total={tierTotal} color={color} />
          ))}
        </div>
      </div>

      {/* D. Download Section */}
      <div className="glass rounded-xl p-6 gradient-border">
        <h2 className="text-lg font-bold text-white mb-1">Export Full Report</h2>
        <p className="text-xs text-[#888] mb-5">9 sheets covering every angle of your campaign data</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {SHEETS.map((s, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03]">
              <span className="flex items-center justify-center w-6 h-6 rounded-md bg-[#2E74B5]/20 text-[#2E74B5] text-xs font-bold shrink-0">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-white leading-tight">{s.name}</p>
                <p className="text-xs text-[#888] mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleDownload}
          disabled={!jobId}
          className={`cta-gradient inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white transition-all
            ${!jobId ? 'opacity-40 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-[0.98]'}`}
        >
          {downloaded ? (
            <>
              <CheckCircle2 size={18} className="text-[#1E8449]" />
              Downloaded
            </>
          ) : (
            <>
              <FileSpreadsheet size={18} />
              Download Full Report (.xlsx)
            </>
          )}
        </button>
      </div>
    </div>
  );
}
