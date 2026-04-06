import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import {
  ClipboardList, Sparkles, Loader2, ArrowUp, ArrowDown, Minus,
  MapPin, DollarSign, TrendingUp, Percent,
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import TierBadge from '../components/TierBadge';
import DataTable from '../components/DataTable';
import {
  formatCurrency, formatPercent, formatMultiplier, nrColorClass,
  getTodayDayName, getTierConfig,
} from '../utils/formatters';
import { fetchInsight } from '../utils/api';

const TABS = [
  { id: 'repost', label: 'Repost Now' },
  { id: 'keep', label: 'Keep Running' },
  { id: 'skip', label: 'Skip' },
  { id: 'conflicts', label: 'Conflicts' },
];

function v(row, ...keys) {
  for (const k of keys) { if (row[k] != null) return row[k]; }
  return null;
}

function KPITile({ label, value, icon: Icon, valueClass = 'text-white' }) {
  return (
    <div className="glass rounded-xl p-4 gradient-border">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-[#5A54BD]" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#666]">{label}</span>
      </div>
      <div className={`text-xl font-bold ${valueClass}`}>{value}</div>
    </div>
  );
}

function TabBadge({ count }) {
  if (!count) return null;
  return (
    <span className="ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-[#5A54BD]/25 text-[#8B86E0]">
      {count}
    </span>
  );
}

// --- Filter dropdown ---
function FilterSelect({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="glass rounded-lg px-3 py-2 text-xs text-white bg-transparent border border-[rgba(90,84,189,0.15)] focus:outline-none focus:border-[#5A54BD]/40"
    >
      <option value="">{label}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export default function ActionPlan() {
  const navigate = useNavigate();
  const { data, insightsCache, cacheInsight } = useAnalysis();
  const [tab, setTab] = useState('repost');
  const [loadingInsights, setLoadingInsights] = useState({});
  const [tierFilter, setTierFilter] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const today = getTodayDayName();

  // --- Data sources ---
  const repostRows = useMemo(() => {
    const src = data?.daily_action_plan?.length ? data.daily_action_plan : (data?.all_repost || []);
    return src.map((r, i) => ({ ...r, _key: `rp-${i}`, _index: i + 1 }));
  }, [data]);

  const keepRows = useMemo(() => (data?.keep_running || []).map((r, i) => ({ ...r, _key: `kr-${i}`, _index: i + 1 })), [data]);
  const skipRows = useMemo(() => (data?.skip || []).map((r, i) => ({ ...r, _key: `sk-${i}`, _index: i + 1 })), [data]);
  const conflictRows = useMemo(() => (data?.location_conflicts || []).map((r, i) => ({ ...r, _key: `lc-${i}`, _index: i + 1 })), [data]);

  const badgeCounts = {
    repost: repostRows.length,
    keep: keepRows.length,
    skip: skipRows.length,
    conflicts: conflictRows.length,
  };

  // --- Repost filters ---
  const filterOptions = useMemo(() => {
    const tiers = [...new Set(repostRows.map((r) => r.tier).filter(Boolean))].sort();
    const triggers = [...new Set(repostRows.map((r) => r.trigger_reason).filter(Boolean))].sort();
    const cats = [...new Set(repostRows.map((r) => v(r, 'recommended_category', 'category')).filter(Boolean))].sort();
    return { tiers, triggers, cats };
  }, [repostRows]);

  const filteredRepost = useMemo(() => {
    let rows = repostRows;
    if (tierFilter) rows = rows.filter((r) => String(r.tier) === tierFilter);
    if (triggerFilter) rows = rows.filter((r) => r.trigger_reason === triggerFilter);
    if (categoryFilter) rows = rows.filter((r) => v(r, 'recommended_category', 'category') === categoryFilter);
    return rows;
  }, [repostRows, tierFilter, triggerFilter, categoryFilter]);

  // --- Summary KPIs ---
  const summary = useMemo(() => {
    const rows = filteredRepost;
    if (!rows.length) return { count: 0, totalSpend: 0, totalNR: 0, avgProfit: 0 };
    const totalSpend = rows.reduce((s, r) => s + (v(r, 'd1_cost', 'D1_Cost', 'cost') || 0), 0);
    const totalNR = rows.reduce((s, r) => s + (v(r, 'est_lifetime_nr', 'Est_Lifetime_NR') || 0), 0);
    const profitVals = rows.filter((r) => v(r, 'profit_pct', 'Profit_Pct') != null);
    const avgProfit = profitVals.length ? profitVals.reduce((s, r) => s + (v(r, 'profit_pct', 'Profit_Pct') || 0), 0) / profitVals.length : 0;
    return { count: rows.length, totalSpend, totalNR, avgProfit };
  }, [filteredRepost]);

  useEffect(() => {
    if (repostRows.length) posthog.capture('action_plan_viewed', { locations_count: repostRows.length });
  }, [repostRows.length]);

  // --- AI Insight loader ---
  async function loadInsight(row) {
    const key = `${row.location}-${v(row, 'recommended_title', 'title')}-${v(row, 'recommended_category', 'category')}`;
    if (insightsCache[key] || loadingInsights[key]) return;
    posthog.capture('insight_requested', { location: row.location, tier: row.tier });
    setLoadingInsights((p) => ({ ...p, [key]: true }));
    try {
      const insight = await fetchInsight({
        location: row.location,
        recommended_title: v(row, 'recommended_title', 'title'),
        title_avg_nr: row.title_avg_nr,
        recommended_category: v(row, 'recommended_category', 'category'),
        cat_avg_nr: row.cat_avg_nr,
        best_day: row.best_day,
        best_day_nr: row.best_day_nr,
        today_day: today,
        profit_pct: v(row, 'profit_pct', 'Profit_Pct'),
        tier: row.tier,
        impr_drop_pct: row.impr_drop_pct,
        trigger_reason: row.trigger_reason,
        est_lifetime_nr: v(row, 'est_lifetime_nr', 'Est_Lifetime_NR'),
        multiplier: row.multiplier_used || row.multiplier,
        mult_source: row.mult_source,
        mult_runs: row.mult_runs_used || row.mult_runs,
        optimal_posts_per_week: row.optimal_posts_per_week,
      });
      cacheInsight(key, insight);
    } catch {
      cacheInsight(key, 'Failed to load insight.');
    } finally {
      setLoadingInsights((p) => ({ ...p, [key]: false }));
    }
  }

  function locLink(val) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); navigate(`/location/${encodeURIComponent(val)}`); }}
        className="text-[#6BB3CD] hover:text-[#8BD0E6] hover:underline font-medium text-left transition-colors"
      >{val}</button>
    );
  }

  function insightCell(_, row) {
    const key = `${row.location}-${v(row, 'recommended_title', 'title')}-${v(row, 'recommended_category', 'category')}`;
    const cached = insightsCache[key];
    if (cached) return <span className="text-xs text-[#aaa] leading-relaxed">{cached}</span>;
    if (loadingInsights[key]) return <Loader2 size={14} className="animate-spin text-[#5A54BD]" />;
    return (
      <button onClick={(e) => { e.stopPropagation(); loadInsight(row); }}
        className="flex items-center gap-1.5 text-xs text-[#5A54BD] hover:text-[#8B86E0] transition-colors">
        <Sparkles size={12} />Load insight
      </button>
    );
  }

  // --- Column defs ---
  const repostCols = [
    { key: '_index', label: '#', width: '44px', align: 'center', render: (val) => <span className="text-[#555]">{val}</span> },
    { key: 'location', label: 'Location', render: (val) => locLink(val) },
    { key: 'recommended_title', label: 'Title', render: (val, row) => <span className="text-white">{val || row.title}</span> },
    { key: 'recommended_category', label: 'Category', render: (val, row) => val || row.category || '--' },
    { key: 'best_day', label: 'Best Day', width: '100px', render: (val, row) => {
      const isToday = row.today_is_best_day || row.Today_Is_Best_Day;
      return (
        <span className={isToday ? 'text-[#1E8449] font-semibold' : 'text-[#ccc]'}>
          {val || '--'}{isToday ? ' *' : ''}
        </span>
      );
    }},
    { key: 'best_time', label: 'Best Time', width: '90px', render: (val) => <span className="text-xs text-[#6BB3CD] font-mono">{val || '10-12'}</span> },
    { key: 'tier', label: 'Tier', width: '76px', render: (val) => <TierBadge tier={val} /> },
    { key: 'd1_cost', label: 'Cost', align: 'right', render: (val, row) => formatCurrency(v(row, 'd1_cost', 'D1_Cost', 'cost')) },
    { key: 'profit_pct', label: 'Profit %', align: 'right', render: (val, row) => { const p = v(row, 'profit_pct', 'Profit_Pct'); return <span className={nrColorClass(p)}>{formatPercent(p)}</span>; } },
    { key: 'trigger_reason', label: 'Trigger', render: (val) => val ? <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-[#5A54BD]/10 text-[#8B86E0] border border-[#5A54BD]/15">{val}</span> : <span className="text-[#444]">--</span> },
    { key: 'd1_applies', label: 'D1', width: '48px', align: 'center', render: (val) => val ? <span className="text-[#1E8449]">Y</span> : <span className="text-[#555]">N</span> },
    { key: 'd1_nr', label: 'D1 NR', align: 'right', render: (val) => <span className={nrColorClass(val)}>{formatCurrency(val)}</span> },
    { key: 'est_lifetime_nr', label: 'Lifetime NR', align: 'right', render: (val, row) => { const n = v(row, 'est_lifetime_nr', 'Est_Lifetime_NR'); return <span className={`font-bold ${nrColorClass(n)}`}>{formatCurrency(n)}</span>; } },
    { key: 'benchmark_nr_delta_pct', label: 'vs Hist', width: '80px', align: 'center', sortable: true, render: (val, row) => {
      if (!row.benchmark_available) return <span className="text-[#444]">--</span>;
      const delta = val || 0;
      if (delta > 20) return <span className="flex items-center justify-center gap-0.5 text-[#1E8449]"><ArrowUp size={12} /><span className="text-[11px] font-semibold">+{delta.toFixed(0)}%</span></span>;
      if (delta < -20) return <span className="flex items-center justify-center gap-0.5 text-[#C0392B]"><ArrowDown size={12} /><span className="text-[11px] font-semibold">{delta.toFixed(0)}%</span></span>;
      return <span className="flex items-center justify-center gap-0.5 text-[#888]"><Minus size={12} /><span className="text-[11px]">{delta > 0 ? '+' : ''}{delta.toFixed(0)}%</span></span>;
    }},
    { key: 'multiplier_used', label: 'Mult', align: 'right', render: (val) => formatMultiplier(val) },
    { key: 'optimal_posts_per_week', label: 'Posts/Wk', align: 'center', render: (val) => val ? <span className={val > 1 ? 'text-[#1E8449] font-semibold' : ''}>{val}x</span> : <span className="text-[#444]">--</span> },
    { key: '_insight', label: 'AI Insight', sortable: false, width: '260px', render: insightCell },
  ];

  const keepCols = [
    { key: '_index', label: '#', width: '44px', align: 'center', render: (val) => <span className="text-[#555]">{val}</span> },
    { key: 'location', label: 'Location', render: (val) => locLink(val) },
    { key: 'title', label: 'Title', render: (val) => <span className="text-white">{val}</span> },
    { key: 'category', label: 'Category' },
    { key: 'tier', label: 'Tier', width: '76px', render: (val) => <TierBadge tier={val} /> },
    { key: 'cost', label: 'Cost', align: 'right', render: (val) => formatCurrency(val) },
    { key: 'total_nr', label: 'Total NR', align: 'right', render: (val) => <span className={`font-bold ${nrColorClass(val)}`}>{formatCurrency(val)}</span> },
    { key: 'profit_pct', label: 'Profit %', align: 'right', render: (val) => <span className={nrColorClass(val)}>{formatPercent(val)}</span> },
    { key: 'impr_drop_pct', label: 'Impr Drop', align: 'right', render: (val) => val != null ? <span className="text-[#E67E22]">{formatPercent(val)}</span> : '--' },
    { key: 'run_days', label: 'Run Days', align: 'center' },
    { key: 'post_id', label: 'Post ID', render: (val) => <span className="text-[#666] font-mono text-[11px]">{val}</span> },
  ];

  const skipCols = [
    { key: '_index', label: '#', width: '44px', align: 'center', render: (val) => <span className="text-[#555]">{val}</span> },
    { key: 'location', label: 'Location', render: (val) => locLink(val) },
    { key: 'title', label: 'Title', render: (val) => <span className="text-white">{val}</span> },
    { key: 'category', label: 'Category' },
    { key: 'tier', label: 'Tier', width: '76px', render: (val) => <TierBadge tier={val} /> },
    { key: 'cost', label: 'Cost', align: 'right', render: (val) => formatCurrency(val) },
    { key: 'profit_pct', label: 'Profit %', align: 'right', render: (val) => <span className={nrColorClass(val)}>{formatPercent(val)}</span> },
    { key: 'est_lifetime_nr', label: 'Est Lifetime NR', align: 'right', render: (val) => <span className={`font-bold ${nrColorClass(val)}`}>{formatCurrency(val)}</span> },
    { key: 'skip_reason', label: 'Skip Reason', render: (val) => {
      const isOverride = val?.toLowerCase().includes('lifetime override');
      return val ? <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] border ${isOverride ? 'bg-[#E67E22]/10 text-[#E67E22] border-[#E67E22]/20' : 'bg-[#7F8C8D]/10 text-[#7F8C8D] border-[#7F8C8D]/20'}`}>{val}</span> : '--';
    }},
  ];

  const conflictCols = [
    { key: 'location', label: 'Location', render: (val) => locLink(val) },
    { key: 'title', label: 'Filtered Title', render: (val) => <span className="text-white">{val}</span> },
    { key: 'category', label: 'Filtered Category' },
    { key: 'tier', label: 'Tier', width: '76px', render: (val) => <TierBadge tier={val} /> },
    { key: 'est_lifetime_nr', label: 'This NR', align: 'right', render: (val) => <span className={nrColorClass(val)}>{formatCurrency(val)}</span> },
    { key: 'winner_title', label: 'Won: Title', render: (val) => <span className="text-[#1E8449]">{val}</span> },
    { key: 'winner_category', label: 'Won: Category', render: (val) => <span className="text-[#1E8449]">{val}</span> },
    { key: 'winner_nr', label: 'Winner NR', align: 'right', render: (val) => <span className={`font-bold ${nrColorClass(val)}`}>{formatCurrency(val)}</span> },
    { key: 'nr_gap', label: 'NR Gap', align: 'right', render: (val) => <span className="text-[#C0392B] font-semibold">{formatCurrency(val)}</span> },
  ];

  const bmSummary = data?.benchmark_summary;
  const hasBenchmarks = bmSummary && bmSummary.total_combos > 0;

  return (
    <div className="page-enter">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <ClipboardList size={22} className="text-[#5A54BD]" />
        <h2 className="text-xl font-bold text-white">Action Plan</h2>
      </div>

      {/* Benchmark banner */}
      {hasBenchmarks && (
        <div className="glass rounded-xl px-4 py-3 mb-4 flex items-center gap-3 border border-[#5A54BD]/20">
          <TrendingUp size={16} className="text-[#5A54BD] shrink-0" />
          <span className="text-xs text-[#999]">
            Historical benchmarks active: <span className="text-white font-medium">{bmSummary.total_combos}</span> combos across <span className="text-white font-medium">{bmSummary.total_locations}</span> locations
            {' '}&middot; Avg NR: <span className="text-[#1E8449] font-medium">{formatCurrency(bmSummary.overall_avg_nr)}</span>
            {' '}&middot; The <span className="text-[#8B86E0]">vs Hist</span> column compares current performance to historical baseline
          </span>
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 glass rounded-xl mb-6">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm transition-all ${tab === t.id ? 'bg-[#5A54BD]/15 text-[#8B86E0] font-medium' : 'text-[#666] hover:text-white hover:bg-white/[0.03]'}`}>
            {t.label}<TabBadge count={badgeCounts[t.id]} />
          </button>
        ))}
      </div>

      {/* Repost Now */}
      {tab === 'repost' && (
        <div>
          {filteredRepost.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <KPITile label="To Repost" value={summary.count} icon={MapPin} />
              <KPITile label="Total Spend" value={formatCurrency(summary.totalSpend)} icon={DollarSign} />
              <KPITile label="Est Lifetime NR" value={formatCurrency(summary.totalNR)} icon={TrendingUp} valueClass={nrColorClass(summary.totalNR)} />
              <KPITile label="Avg Profit %" value={formatPercent(summary.avgProfit)} icon={Percent} valueClass={summary.avgProfit >= 0 ? 'text-[#1E8449]' : 'text-[#C0392B]'} />
            </div>
          )}
          <div className="flex flex-wrap gap-3 mb-4">
            <FilterSelect label="All Tiers" value={tierFilter} onChange={setTierFilter} options={filterOptions.tiers.map(String)} />
            <FilterSelect label="All Triggers" value={triggerFilter} onChange={setTriggerFilter} options={filterOptions.triggers} />
            <FilterSelect label="All Categories" value={categoryFilter} onChange={setCategoryFilter} options={filterOptions.cats} />
          </div>
          <DataTable columns={repostCols} data={filteredRepost} searchable
            searchPlaceholder="Search locations, titles, categories..."
            searchFields={['location', 'title', 'category', 'recommended_title', 'recommended_category']}
            onRowClick={(row) => navigate(`/location/${encodeURIComponent(row.location)}`)}
            rowClassName={(row) => getTierConfig(row.tier).rowBg || ''}
            maxHeight="calc(100vh - 340px)" />
        </div>
      )}

      {/* Keep Running */}
      {tab === 'keep' && (
        <DataTable columns={keepCols} data={keepRows} searchable
          searchPlaceholder="Search locations, titles..."
          searchFields={['location', 'title', 'category']}
          onRowClick={(row) => navigate(`/location/${encodeURIComponent(row.location)}`)}
          rowClassName={(row) => getTierConfig(row.tier).rowBg || ''}
          maxHeight="calc(100vh - 260px)" />
      )}

      {/* Skip */}
      {tab === 'skip' && (
        <DataTable columns={skipCols} data={skipRows} searchable
          searchPlaceholder="Search locations, reasons..."
          searchFields={['location', 'title', 'category', 'skip_reason']}
          onRowClick={(row) => navigate(`/location/${encodeURIComponent(row.location)}`)}
          rowClassName={(row) => getTierConfig(row.tier).rowBg || ''}
          maxHeight="calc(100vh - 260px)" />
      )}

      {/* Conflicts */}
      {tab === 'conflicts' && (
        <DataTable columns={conflictCols} data={conflictRows} searchable
          searchPlaceholder="Search locations, titles..."
          searchFields={['location', 'title', 'category', 'winner_title', 'winner_category']}
          onRowClick={(row) => navigate(`/location/${encodeURIComponent(row.location)}`)}
          maxHeight="calc(100vh - 260px)" />
      )}
    </div>
  );
}
