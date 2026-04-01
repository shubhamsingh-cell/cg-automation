import { useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import { ArrowLeft, MapPin, TrendingUp, Calendar, Award } from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import TierBadge from '../components/TierBadge';
import DataTable from '../components/DataTable';
import { formatCurrency, formatPercent, formatMultiplier, nrColorClass } from '../utils/formatters';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function LocationDetail() {
  const { locationName } = useParams();
  const location = decodeURIComponent(locationName);
  const navigate = useNavigate();
  const { data } = useAnalysis();

  const locIntel = useMemo(() => {
    if (!data?.location_intelligence) return null;
    if (Array.isArray(data.location_intelligence)) {
      return data.location_intelligence.find((l) => l.location === location);
    }
    return data.location_intelligence[location] || null;
  }, [data, location]);

  const actionRow = useMemo(() => {
    return data?.daily_action_plan?.find((r) => r.location === location) ||
      data?.all_repost?.find((r) => r.location === location) || null;
  }, [data, location]);

  const multiplierRow = useMemo(() => {
    return data?.location_multipliers?.find((r) => r.location === location) || null;
  }, [data, location]);

  const historyRuns = useMemo(() => {
    if (!data?.all_runs) return [];
    return data.all_runs.filter((r) => r.location === location);
  }, [data, location]);

  const frequencyData = useMemo(() => {
    if (!data?.frequency_optimization) return [];
    const items = data.frequency_optimization.filter((r) => r.location === location);
    return items.map((item) => {
      if (item.nr_curve && typeof item.nr_curve === 'string') {
        try {
          const pairs = item.nr_curve.split('|').map((p) => {
            const [freq, nr] = p.trim().split('->');
            return { frequency: freq.trim(), nr: parseFloat(nr.replace('$', '')) };
          });
          return { ...item, curve_data: pairs };
        } catch { return { ...item, curve_data: [] }; }
      }
      return { ...item, curve_data: [] };
    });
  }, [data, location]);

  useEffect(() => {
    posthog.capture('location_detail_viewed', { location });
  }, [location]);

  const titleColumns = [
    { key: 'title', label: 'Title', render: (v) => <span className="text-white">{v}</span> },
    { key: 'runs', label: 'Runs', align: 'center' },
    { key: 'avg_d1_applies', label: 'Avg D1 Applies', align: 'right', render: (v) => v?.toFixed(2) ?? '--' },
    { key: 'avg_total_nr', label: 'Avg Total NR', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatCurrency(v)}</span> },
    { key: 'avg_profit_pct', label: 'Avg Profit %', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatPercent(v)}</span> },
    { key: 'recommended', label: '', width: '30px', sortable: false, render: (v) => v ? <Award size={14} className="text-[#1E8449]" /> : null },
  ];

  const categoryColumns = [
    { key: 'category', label: 'Category', render: (v) => <span className="text-white">{v}</span> },
    { key: 'runs', label: 'Runs', align: 'center' },
    { key: 'avg_d1_applies', label: 'Avg D1 Applies', align: 'right', render: (v) => v?.toFixed(2) ?? '--' },
    { key: 'avg_total_nr', label: 'Avg Total NR', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatCurrency(v)}</span> },
    { key: 'avg_profit_pct', label: 'Avg Profit %', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatPercent(v)}</span> },
    { key: 'recommended', label: '', width: '30px', sortable: false, render: (v) => v ? <Award size={14} className="text-[#1E8449]" /> : null },
  ];

  const dayColumns = [
    { key: 'day', label: 'Day', render: (v) => <span className="text-white">{v}</span> },
    { key: 'runs', label: 'Runs', align: 'center' },
    { key: 'avg_d1_applies', label: 'Avg D1 Applies', align: 'right', render: (v) => v?.toFixed(2) ?? '--' },
    { key: 'avg_total_nr', label: 'Avg Total NR', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatCurrency(v)}</span> },
    { key: 'avg_profit_pct', label: 'Avg Profit %', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatPercent(v)}</span> },
    { key: 'recommendation', label: 'Rec.', render: (v) => v ? <span className="text-xs text-[#1E8449]">{v}</span> : null },
  ];

  const historyColumns = [
    { key: 'post_id', label: 'Post ID' },
    { key: 'title', label: 'Title' },
    { key: 'category', label: 'Category' },
    { key: 'date', label: 'Date', render: (v) => v || '--' },
    { key: 'cost', label: 'Cost', align: 'right', render: (v) => formatCurrency(v) },
    { key: 'total_nr', label: 'Total NR', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatCurrency(v)}</span> },
    { key: 'profit_pct', label: 'Profit %', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatPercent(v)}</span> },
    { key: 'run_days', label: 'Days', align: 'center' },
  ];

  return (
    <div>
      {/* Header */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-[#666] hover:text-white mb-4 transition-colors">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="flex items-center gap-3 mb-6">
        <MapPin size={20} className="text-[#6BB3CD]" />
        <h2 className="text-xl font-bold text-white">{location}</h2>
        {actionRow?.tier && <TierBadge tier={actionRow.tier} />}
      </div>

      {/* Summary Card */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <SummaryItem
          label="Recommended Title"
          value={locIntel?.best_title || actionRow?.recommended_title || '--'}
          sub={locIntel?.title_avg_nr != null ? `Avg NR: ${formatCurrency(locIntel.title_avg_nr)}` : undefined}
          highlight
        />
        <SummaryItem
          label="Recommended Category"
          value={locIntel?.best_category || actionRow?.recommended_category || '--'}
          sub={locIntel?.cat_avg_nr != null ? `Avg NR: ${formatCurrency(locIntel.cat_avg_nr)}` : undefined}
          highlight
        />
        <SummaryItem
          label="Best Day"
          value={locIntel?.best_day || actionRow?.best_day || '--'}
          sub={locIntel?.day_avg_nr != null ? `Avg NR: ${formatCurrency(locIntel.day_avg_nr)}` : undefined}
          highlight
        />
        <SummaryItem label="Multiplier" value={multiplierRow ? formatMultiplier(multiplierRow.multiplier) : '--'} sub={multiplierRow?.mult_source || '--'} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <SummaryItem label="Decision" value={actionRow?.decision || '--'} />
        <SummaryItem label="Trigger" value={actionRow?.trigger_reason || 'N/A'} />
        <SummaryItem label="Posts/Week" value={actionRow?.optimal_posts_per_week ? `${actionRow.optimal_posts_per_week}x` : '--'} />
        <SummaryItem label="Est Lifetime NR" value={actionRow?.est_lifetime_nr != null ? formatCurrency(actionRow.est_lifetime_nr) : '--'} valueClass={nrColorClass(actionRow?.est_lifetime_nr)} />
      </div>

      {/* Title Rankings */}
      {locIntel?.title_rankings && (
        <Section title="Title Performance">
          <DataTable columns={titleColumns} data={locIntel.title_rankings} />
        </Section>
      )}

      {/* Category Rankings */}
      {locIntel?.category_rankings && (
        <Section title="Category Performance">
          <DataTable columns={categoryColumns} data={locIntel.category_rankings} />
        </Section>
      )}

      {/* Best Day */}
      {locIntel?.day_rankings && (
        <Section title="Day of Week Performance">
          <DataTable columns={dayColumns} data={locIntel.day_rankings} />
        </Section>
      )}

      {/* Combo Matrix */}
      {locIntel?.combo_matrix && locIntel.combo_matrix.length > 0 && (
        <Section title="Title x Category Combo Matrix">
          <div className="overflow-auto rounded-xl border border-[rgba(90,84,189,0.1)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#0F1629]">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#5A54BD]/70">Title \ Category</th>
                  {locIntel.combo_matrix[0]?.categories?.map((cat) => (
                    <th key={cat} className="px-4 py-3 text-center text-xs font-semibold text-[#5A54BD]/70">{cat}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {locIntel.combo_matrix.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-[#0a0b14]' : 'bg-[#0e1020]'}>
                    <td className="px-4 py-3 text-white">{row.title}</td>
                    {row.values?.map((val, j) => (
                      <td key={j} className={`px-4 py-3 text-center font-medium ${nrColorClass(val)}`}>
                        {val != null ? formatCurrency(val) : '--'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Frequency Curve */}
      {frequencyData.length > 0 && frequencyData[0].curve_data?.length > 0 && (
        <Section title="Frequency NR Curve">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={frequencyData[0].curve_data}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(90,84,189,0.1)" />
                <XAxis dataKey="frequency" stroke="#444" tick={{ fill: '#888', fontSize: 12 }} />
                <YAxis stroke="#444" tick={{ fill: '#888', fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ background: '#161B2E', border: '1px solid rgba(90,84,189,0.2)', borderRadius: 8 }}
                  labelStyle={{ color: '#888' }}
                  formatter={(v) => [`$${v.toFixed(2)}`, 'Weekly NR']}
                />
                <Line type="monotone" dataKey="nr" stroke="#5A54BD" strokeWidth={2} dot={{ fill: '#6BB3CD', r: 4 }} activeDot={{ fill: '#5A54BD', r: 6, stroke: '#6BB3CD', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {/* Historical Runs */}
      {historyRuns.length > 0 && (
        <Section title={`Historical Runs (${historyRuns.length})`}>
          <DataTable columns={historyColumns} data={historyRuns} maxHeight="400px" />
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-white mb-3">{title}</h3>
      {children}
    </div>
  );
}

function SummaryItem({ label, value, sub, valueClass = 'text-white', highlight = false }) {
  return (
    <div className={`glass rounded-xl p-4 ${highlight ? 'gradient-border' : ''}`}>
      <div className="text-[10px] font-semibold text-[#5A54BD]/50 uppercase tracking-wider mb-1.5">{label}</div>
      <div className={`text-sm font-semibold ${highlight ? 'text-[#6BB3CD]' : valueClass}`}>{value}</div>
      {sub && <div className="text-xs text-[#666] mt-0.5">{sub}</div>}
    </div>
  );
}
