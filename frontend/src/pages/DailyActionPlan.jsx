import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import { Sparkles, Loader2, CheckCircle, AlertTriangle, Calendar, MapPin, DollarSign, TrendingUp, Percent } from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import TierBadge from '../components/TierBadge';
import DataTable from '../components/DataTable';
import { formatCurrency, formatPercent, nrColorClass, getTodayDayName, getTierConfig } from '../utils/formatters';
import { fetchInsight } from '../utils/api';

function KPISummaryCard({ label, value, icon: Icon, valueClass = 'text-white' }) {
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

export default function DailyActionPlan() {
  const navigate = useNavigate();
  const { data, insightsCache, cacheInsight } = useAnalysis();
  const [loadingInsights, setLoadingInsights] = useState({});
  const today = getTodayDayName();

  const rows = useMemo(() => {
    if (!data?.daily_action_plan) return [];
    return data.daily_action_plan.map((row, i) => ({ ...row, _key: `${row.location}-${i}`, _index: i + 1 }));
  }, [data]);

  const summary = useMemo(() => {
    if (!rows.length) return { totalSpend: 0, totalLifetimeNR: 0, count: 0, avgProfit: 0 };
    const totalSpend = rows.reduce((s, r) => s + (r.d1_cost || r.D1_Cost || 0), 0);
    const totalLifetimeNR = rows.reduce((s, r) => s + (r.est_lifetime_nr || r.Est_Lifetime_NR || 0), 0);
    const profitVals = rows.filter(r => (r.profit_pct ?? r.Profit_Pct) != null);
    const avgProfit = profitVals.length > 0
      ? profitVals.reduce((s, r) => s + (r.profit_pct || r.Profit_Pct || 0), 0) / profitVals.length
      : 0;
    return { count: rows.length, totalSpend, totalLifetimeNR, avgProfit };
  }, [rows]);

  useEffect(() => {
    if (rows.length > 0) {
      posthog.capture('action_plan_viewed', { locations_count: rows.length });
    }
  }, [rows.length]);

  async function loadInsight(row) {
    const key = `${row.location}-${row.recommended_title}-${row.recommended_category}`;
    if (insightsCache[key] || loadingInsights[key]) return;
    posthog.capture('insight_requested', { location: row.location, tier: row.tier });
    setLoadingInsights((p) => ({ ...p, [key]: true }));
    try {
      const insight = await fetchInsight({
        location: row.location,
        recommended_title: row.recommended_title,
        title_avg_nr: row.title_avg_nr,
        recommended_category: row.recommended_category,
        cat_avg_nr: row.cat_avg_nr,
        best_day: row.best_day,
        best_day_nr: row.best_day_nr,
        today_day: today,
        profit_pct: row.profit_pct,
        tier: row.tier,
        impr_drop_pct: row.impr_drop_pct,
        trigger_reason: row.trigger_reason,
        est_lifetime_nr: row.est_lifetime_nr,
        multiplier: row.multiplier,
        mult_source: row.mult_source,
        mult_runs: row.mult_runs,
        optimal_posts_per_week: row.optimal_posts_per_week,
      });
      cacheInsight(key, insight);
    } catch {
      cacheInsight(key, 'Failed to load insight.');
    } finally {
      setLoadingInsights((p) => ({ ...p, [key]: false }));
    }
  }

  const columns = [
    { key: '_index', label: '#', width: '50px', align: 'center', render: (v) => <span className="text-[#555]">{v}</span> },
    {
      key: 'tier',
      label: 'Tier',
      width: '80px',
      render: (v) => <TierBadge tier={v} />,
    },
    {
      key: 'location',
      label: 'Location',
      render: (v, row) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/location/${encodeURIComponent(v)}`);
          }}
          className="text-[#6BB3CD] hover:text-[#8BD0E6] hover:underline font-medium text-left transition-colors"
        >
          {v}
        </button>
      ),
    },
    { key: 'recommended_title', label: 'Title', render: (v) => <span className="text-white">{v}</span> },
    { key: 'recommended_category', label: 'Category' },
    {
      key: 'best_day',
      label: 'Best Day',
      render: (v) => {
        const isToday = v?.toLowerCase() === today.toLowerCase();
        return (
          <span className="flex items-center gap-1.5">
            {isToday ? (
              <CheckCircle size={13} className="text-[#1E8449]" />
            ) : (
              <AlertTriangle size={13} className="text-[#E67E22]" />
            )}
            <span className={isToday ? 'text-[#1E8449] font-medium' : 'text-[#E67E22]'}>{v}</span>
          </span>
        );
      },
    },
    {
      key: 'decision',
      label: 'Decision',
      render: (v) => {
        const colors = {
          REPOST: 'text-[#5A54BD]',
          'KEEP RUNNING': 'text-[#1E8449]',
          SKIP: 'text-[#7F8C8D]',
        };
        return <span className={`font-medium ${colors[v] || 'text-white'}`}>{v}</span>;
      },
    },
    {
      key: 'trigger_reason',
      label: 'Trigger',
      render: (v) =>
        v ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-[#5A54BD]/10 text-[#8B86E0] border border-[#5A54BD]/15">
            {v}
          </span>
        ) : (
          <span className="text-[#444]">--</span>
        ),
    },
    {
      key: 'est_d1_nr',
      label: 'Est D1 NR',
      align: 'right',
      render: (v) => <span className={nrColorClass(v)}>{formatCurrency(v)}</span>,
    },
    {
      key: 'est_lifetime_nr',
      label: 'Est Lifetime NR',
      align: 'right',
      render: (v) => <span className={`font-bold ${nrColorClass(v)}`}>{formatCurrency(v)}</span>,
    },
    {
      key: 'optimal_posts_per_week',
      label: 'Posts/Wk',
      align: 'center',
      render: (v) => (
        <span className={v > 1 ? 'text-[#1E8449] font-semibold' : ''}>
          {v ? `${v}x` : '--'}
        </span>
      ),
    },
    {
      key: '_insight',
      label: 'AI Insight',
      sortable: false,
      width: '280px',
      render: (_, row) => {
        const key = `${row.location}-${row.recommended_title}-${row.recommended_category}`;
        const cached = insightsCache[key];
        const loading = loadingInsights[key];

        if (cached) return <span className="text-xs text-[#aaa] leading-relaxed">{cached}</span>;
        if (loading) return <Loader2 size={14} className="animate-spin text-[#5A54BD]" />;

        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              loadInsight(row);
            }}
            className="flex items-center gap-1.5 text-xs text-[#5A54BD] hover:text-[#8B86E0] transition-colors"
          >
            <Sparkles size={12} />
            Load insight
          </button>
        );
      },
    },
  ];

  // Tier-based row tinting
  function getRowClassName(row) {
    const config = getTierConfig(row.tier);
    return config.rowBg || '';
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Daily Action Plan</h2>
          <p className="text-sm text-[#666] mt-1">
            Today is <span className="text-white font-medium">{today}</span> -- {summary.count} locations to post
          </p>
        </div>
      </div>

      {/* KPI Summary Cards */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KPISummaryCard
            label="Total Locations"
            value={summary.count}
            icon={MapPin}
          />
          <KPISummaryCard
            label="Est Total NR"
            value={formatCurrency(summary.totalLifetimeNR)}
            icon={TrendingUp}
            valueClass={nrColorClass(summary.totalLifetimeNR)}
          />
          <KPISummaryCard
            label="Total Spend"
            value={formatCurrency(summary.totalSpend)}
            icon={DollarSign}
          />
          <KPISummaryCard
            label="Avg Profit %"
            value={formatPercent(summary.avgProfit)}
            icon={Percent}
            valueClass={summary.avgProfit >= 0 ? 'text-[#1E8449]' : 'text-[#C0392B]'}
          />
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        searchable
        searchPlaceholder="Search locations, titles, categories..."
        searchFields={['location', 'recommended_title', 'recommended_category']}
        onRowClick={(row) => navigate(`/location/${encodeURIComponent(row.location)}`)}
        rowClassName={getRowClassName}
      />

      {/* Summary Bar */}
      {rows.length > 0 && (
        <div className="mt-6 glass rounded-xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-[#1E8449]" />
            <span className="text-sm font-medium text-white">Post This List</span>
          </div>
          <div className="flex items-center gap-8 text-sm">
            <div>
              <span className="text-[#666]">Locations: </span>
              <span className="text-white font-semibold">{summary.count}</span>
            </div>
            <div>
              <span className="text-[#666]">Total Spend: </span>
              <span className="text-white font-semibold">{formatCurrency(summary.totalSpend)}</span>
            </div>
            <div>
              <span className="text-[#666]">Expected Lifetime NR: </span>
              <span className={`font-semibold ${nrColorClass(summary.totalLifetimeNR)}`}>
                {formatCurrency(summary.totalLifetimeNR)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
