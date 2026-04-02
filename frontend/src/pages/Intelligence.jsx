import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Type, FolderOpen, Calendar, MapPin, TrendingUp, Activity } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAnalysis } from '../context/AnalysisContext';
import DataTable from '../components/DataTable';
import HeatmapCell from '../components/HeatmapCell';
import { formatCurrency, formatPercent, formatMultiplier, formatNumber, nrColorClass } from '../utils/formatters';

const TABS = [
  { key: 'titles', label: 'Titles', icon: Type },
  { key: 'categories', label: 'Categories', icon: FolderOpen },
  // Best Day tab removed per Ayushi feedback (S37) -- was limiting posting decisions
  { key: 'locations', label: 'Locations', icon: MapPin },
  { key: 'frequency', label: 'Frequency', icon: TrendingUp },
  { key: 'trends', label: 'Trends', icon: Activity },
];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CHART_COLORS = ['#5A54BD', '#6BB3CD', '#8B86E0', '#1E8449', '#E67E22', '#C0392B', '#2E74B5', '#9B59B6', '#F1C40F', '#1ABC9C'];
const TT_STYLE = {
  contentStyle: { backgroundColor: '#1a1a2e', border: '1px solid rgba(90,84,189,0.3)', borderRadius: '8px', color: '#ccc', fontSize: '12px' },
  labelStyle: { color: '#8B86E0' },
};

function normalizeIntel(raw) {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : Object.values(raw);
}
function aggregateByField(intel, field, rankingsKey) {
  const map = {};
  intel.forEach((loc) => {
    (loc[rankingsKey] || []).forEach((item) => {
      const name = item[field];
      if (!name) return;
      if (!map[name]) map[name] = { [field]: name, total_nr: 0, total_profit: 0, total_runs: 0, locations: 0 };
      const runs = item.runs || 1;
      map[name].total_nr += (item.avg_total_nr || 0) * runs;
      map[name].total_profit += (item.avg_profit_pct || 0) * runs;
      map[name].total_runs += item.runs || 0;
      map[name].locations += 1;
    });
  });
  return Object.values(map).map((t) => ({
    ...t,
    avg_total_nr: t.total_runs > 0 ? t.total_nr / t.total_runs : 0,
    avg_profit_pct: t.total_runs > 0 ? t.total_profit / t.total_runs : 0,
  })).sort((a, b) => b.avg_total_nr - a.avg_total_nr);
}
function parseDate(s) { if (!s) return null; const d = new Date(s); return isNaN(d.getTime()) ? null : d; }
function getWeekKey(date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); d.setDate(d.getDate() - dow + (dow === 0 ? -6 : 1));
  return d.toISOString().slice(0, 10);
}
function fmtShort(s) { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function fmtY(v) { return `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`; }
function LocationFilter({ value, onChange, locations }) {
  return (
    <div className="mb-5">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#5A54BD]/50 w-full max-w-sm">
        <option value="">All locations (global view)</option>
        {locations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
      </select>
    </div>
  );
}
function StatCard({ label, value, sub, color }) {
  return (
    <div className="glass rounded-xl p-4 gradient-border">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#666] block mb-1">{label}</span>
      <span className="text-xl font-bold text-white" style={color ? { color } : undefined}>{value}</span>
      {sub && <span className="text-xs text-[#555] block mt-0.5">{sub}</span>}
    </div>
  );
}
function locBtn(navigate, v) {
  return <button onClick={() => navigate(`/location/${encodeURIComponent(v)}`)} className="text-[#2E74B5] hover:underline text-left">{v}</button>;
}
function nrCell(v) { return <span className={nrColorClass(v)}>{formatCurrency(v)}</span>; }
function pctCell(v) { return <span className={nrColorClass(v)}>{formatPercent(v)}</span>; }
const BEST_BADGE = (v) => v ? <span className="text-[#1E8449] font-bold text-xs">BEST</span> : null;

function EmptyState({ title, description }) {
  const navigate = useNavigate();
  return (
    <div className="glass rounded-xl p-10 text-center gradient-border">
      <Brain size={40} className="text-[#5A54BD]/40 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-white mb-2">{title || 'No Data Yet'}</h3>
      <p className="text-[#666] text-sm mb-6 max-w-md mx-auto">
        {description || 'Upload your campaign data to unlock intelligence insights. CG Automation will analyze title, category, timing, and frequency performance across all locations.'}
      </p>
      <button onClick={() => navigate('/upload')}
        className="cta-gradient px-6 py-2.5 rounded-lg text-white text-sm font-medium">
        Upload Campaign Data
      </button>
    </div>
  );
}

export default function Intelligence() {
  const navigate = useNavigate();
  const { data } = useAnalysis();
  const [activeTab, setActiveTab] = useState('titles');
  const intel = useMemo(() => normalizeIntel(data?.location_intelligence), [data]);
  const locations = useMemo(() => intel.map((l) => l.location).filter(Boolean).sort(), [intel]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Brain size={22} className="text-[#5A54BD]" />
        <h2 className="text-xl font-bold text-white">Intelligence</h2>
      </div>
      {!data ? (
        <EmptyState title="Intelligence Awaits Your Data" description="Upload your Craigslist campaign CSV or Excel file to see per-location title rankings, category performance, best posting days, frequency optimization, and trend analysis." />
      ) : (
        <>
          <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
            {TABS.map((tab) => {
              const Icon = tab.icon; const active = activeTab === tab.key;
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${active ? 'bg-[#5A54BD]/20 text-[#8B86E0] border border-[#5A54BD]/30' : 'text-[#666] hover:text-[#999] hover:bg-white/[0.03] border border-transparent'}`}>
                  <Icon size={14} />{tab.label}
                </button>
              );
            })}
          </div>
          {activeTab === 'titles' && <TitlesTab intel={intel} locations={locations} navigate={navigate} />}
          {activeTab === 'categories' && <CategoriesTab intel={intel} locations={locations} navigate={navigate} />}
          {/* Best Day tab removed per Ayushi feedback (S37) */}
          {activeTab === 'locations' && <LocationsTab data={data} navigate={navigate} />}
          {activeTab === 'frequency' && <FrequencyTab data={data} navigate={navigate} />}
          {activeTab === 'trends' && <TrendsTab data={data} />}
        </>
      )}
    </div>
  );
}

function TitlesTab({ intel, locations, navigate }) {
  const [sel, setSel] = useState('');
  const global = useMemo(() => aggregateByField(intel, 'title', 'title_rankings'), [intel]);
  const local = useMemo(() => sel ? (intel.find((l) => l.location === sel)?.title_rankings || []) : [], [intel, sel]);
  const gCols = [
    { key: 'title', label: 'Title', render: (v) => <span className="text-white">{v}</span> },
    { key: 'avg_total_nr', label: 'Avg NR', align: 'right', render: (_, r) => nrCell(r.avg_total_nr) },
    { key: 'avg_profit_pct', label: 'Avg Profit %', align: 'right', render: (_, r) => pctCell(r.avg_profit_pct) },
    { key: 'total_runs', label: 'Total Runs', align: 'center' },
    { key: 'locations', label: '# Locations', align: 'center' },
  ];
  const lCols = [
    { key: 'title', label: 'Title', render: (v) => <span className="text-white">{v}</span> },
    { key: 'runs', label: 'Runs', align: 'center' },
    { key: 'avg_total_nr', label: 'Avg NR', align: 'right', render: (v) => nrCell(v) },
    { key: 'avg_profit_pct', label: 'Avg Profit %', align: 'right', render: (v) => pctCell(v) },
    { key: 'recommended', label: 'Rec.', align: 'center', render: BEST_BADGE },
  ];
  return (
    <div>
      <LocationFilter value={sel} onChange={setSel} locations={locations} />
      {!sel ? (
        <><h3 className="text-sm font-semibold text-white mb-3">Global Title Performance</h3>
          <DataTable columns={gCols} data={global} searchable searchPlaceholder="Search titles..." searchFields={['title']} emptyMessage="No title data available" /></>
      ) : (
        <><h3 className="text-sm font-semibold text-white mb-3">Title Rankings -- {sel}</h3>
          <DataTable columns={lCols} data={local} emptyMessage={`No title data for ${sel}`} /></>
      )}
    </div>
  );
}

function CategoriesTab({ intel, locations }) {
  const [sel, setSel] = useState('');
  const global = useMemo(() => aggregateByField(intel, 'category', 'category_rankings'), [intel]);
  const local = useMemo(() => sel ? (intel.find((l) => l.location === sel)?.category_rankings || []) : [], [intel, sel]);
  const gCols = [
    { key: 'category', label: 'Category', render: (v) => <span className="text-white">{v}</span> },
    { key: 'avg_total_nr', label: 'Avg NR', align: 'right', render: (_, r) => nrCell(r.avg_total_nr) },
    { key: 'avg_profit_pct', label: 'Avg Profit %', align: 'right', render: (_, r) => pctCell(r.avg_profit_pct) },
    { key: 'total_runs', label: 'Total Runs', align: 'center' },
    { key: 'locations', label: '# Locations', align: 'center' },
  ];
  const lCols = [
    { key: 'category', label: 'Category', render: (v) => <span className="text-white">{v}</span> },
    { key: 'runs', label: 'Runs', align: 'center' },
    { key: 'avg_total_nr', label: 'Avg NR', align: 'right', render: (v) => nrCell(v) },
    { key: 'avg_profit_pct', label: 'Avg Profit %', align: 'right', render: (v) => pctCell(v) },
    { key: 'recommended', label: 'Rec.', align: 'center', render: BEST_BADGE },
  ];
  return (
    <div>
      <LocationFilter value={sel} onChange={setSel} locations={locations} />
      {!sel ? (
        <><h3 className="text-sm font-semibold text-white mb-3">Global Category Performance</h3>
          <DataTable columns={gCols} data={global} searchable searchPlaceholder="Search categories..." searchFields={['category']} emptyMessage="No category data available" /></>
      ) : (
        <><h3 className="text-sm font-semibold text-white mb-3">Category Rankings -- {sel}</h3>
          <DataTable columns={lCols} data={local} emptyMessage={`No category data for ${sel}`} /></>
      )}
    </div>
  );
}

function BestDayTab({ intel }) {
  const rows = useMemo(() => intel.map((loc) => {
    const dv = {}; (loc.day_rankings || []).forEach((d) => { dv[d.day] = d.avg_total_nr; });
    const vals = DAYS.map((day) => dv[day] ?? null);
    const valid = vals.filter((v) => v != null);
    return { location: loc.location, best_day: loc.best_day, values: vals,
      maxVal: valid.length ? Math.max(...valid) : null, minVal: valid.length ? Math.min(...valid) : null };
  }).sort((a, b) => (a.location || '').localeCompare(b.location || '')), [intel]);

  return (
    <div>
      <div className="flex items-center gap-4 mb-5 text-xs">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#1E8449]/30" /><span className="text-[#999]">Best day</span></span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#C0392B]/20" /><span className="text-[#999]">Worst day</span></span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[#2a2a2a]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#0F2037]">
              <th className="px-4 py-3 text-left text-xs font-semibold text-[#8bb8e0] uppercase tracking-wider sticky left-0 bg-[#0F2037] z-20 min-w-[180px]">Location</th>
              {DAYS.map((day) => <th key={day} className="px-3 py-3 text-center text-xs font-semibold text-[#8bb8e0] uppercase tracking-wider min-w-[100px]">{day.slice(0, 3)}</th>)}
              <th className="px-4 py-3 text-center text-xs font-semibold text-[#8bb8e0] uppercase tracking-wider">Best Day</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1f1f1f]">
            {rows.length === 0 ? (
              <tr><td colSpan={DAYS.length + 2} className="px-4 py-12 text-center text-[#555]">No day-of-week data available</td></tr>
            ) : rows.map((row, i) => (
              <tr key={row.location} className={i % 2 === 0 ? 'bg-[#111]' : 'bg-[#141414]'}>
                <td className="px-4 py-2 text-white font-medium sticky left-0 bg-inherit z-10">{row.location}</td>
                {row.values.map((val, j) => <HeatmapCell key={DAYS[j]} value={val} isMax={val != null && val === row.maxVal} isMin={val != null && val === row.minVal} />)}
                <td className="px-4 py-2 text-center"><span className="text-[#1E8449] font-medium text-xs">{row.best_day || '--'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LocationsTab({ data, navigate }) {
  const rows = useMemo(() => data?.location_multipliers || [], [data]);
  const stats = useMemo(() => {
    if (!rows.length) return { total: 0, loc: 0, cat: 0, glob: 0, locPct: '0', catPct: '0', globPct: '0' };
    const loc = rows.filter((r) => r.mult_source?.toLowerCase().includes('location')).length;
    const cat = rows.filter((r) => r.mult_source?.toLowerCase().includes('category')).length;
    const glob = rows.length - loc - cat;
    return { total: rows.length, loc, cat, glob,
      locPct: ((loc / rows.length) * 100).toFixed(0), catPct: ((cat / rows.length) * 100).toFixed(0), globPct: ((glob / rows.length) * 100).toFixed(0) };
  }, [rows]);
  const cols = [
    { key: 'location', label: 'Location', render: (v) => locBtn(navigate, v) },
    { key: 'multiplier', label: 'Multiplier', align: 'right', render: (v) => <span className="text-white font-semibold">{formatMultiplier(v)}</span> },
    { key: 'mult_source', label: 'Source', render: (v) => {
      const isL = v?.toLowerCase().includes('location'), isC = v?.toLowerCase().includes('category');
      return <span className={`text-xs font-medium px-2 py-1 rounded ${isL ? 'bg-[#2E74B5]/15 text-[#2E74B5]' : isC ? 'bg-[#E67E22]/15 text-[#E67E22]' : 'bg-[#7F8C8D]/15 text-[#7F8C8D]'}`}>{v || '--'}</span>;
    }},
    { key: 'mult_runs', label: 'Runs Used', align: 'center' },
    { key: 'avg_run_days', label: 'Avg Run Days', align: 'right', render: (v) => v?.toFixed(1) ?? '--' },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Locations" value={formatNumber(stats.total)} />
        <StatCard label="Location-Specific" value={`${stats.locPct}%`} sub={`${stats.loc} locations`} color="#2E74B5" />
        <StatCard label="Category Fallback" value={`${stats.catPct}%`} sub={`${stats.cat} locations`} color="#E67E22" />
        <StatCard label="Global Fallback" value={`${stats.globPct}%`} sub={`${stats.glob} locations`} color="#7F8C8D" />
      </div>
      <DataTable columns={cols} data={rows} searchable searchPlaceholder="Search locations..." searchFields={['location', 'mult_source']}
        onRowClick={(row) => navigate(`/location/${encodeURIComponent(row.location)}`)} emptyMessage="No multiplier data available" />
    </div>
  );
}

function FrequencyTab({ data, navigate }) {
  const rows = useMemo(() => {
    if (!data?.frequency_optimization) return [];
    return [...data.frequency_optimization].sort((a, b) => (b.optimal_posts_per_week || 1) - (a.optimal_posts_per_week || 1));
  }, [data]);
  const chartData = useMemo(() => {
    const mf = rows.find((r) => r.optimal_posts_per_week > 1 && r.nr_curve);
    if (!mf?.nr_curve) return null;
    try {
      const pairs = mf.nr_curve.split('|').map((p) => { const [f, n] = p.trim().split('->'); return { frequency: f.trim(), nr: parseFloat(n.replace('$', '')) }; });
      return { label: `${mf.location} -- ${mf.title}`, data: pairs };
    } catch { return null; }
  }, [rows]);
  const cols = [
    { key: 'location', label: 'Location', render: (v) => locBtn(navigate, v) },
    { key: 'title', label: 'Title', render: (v) => <span className="text-white">{v}</span> },
    { key: 'category', label: 'Category' },
    { key: 'optimal_posts_per_week', label: 'Optimal/Wk', align: 'center', render: (v) => <span className={`font-semibold ${v > 1 ? 'text-[#1E8449]' : 'text-white'}`}>{v ? `${v}x` : '--'}</span> },
    { key: 'expected_weekly_nr', label: 'Expected Wk NR', align: 'right', render: (v) => nrCell(v) },
    { key: 'nr_at_1x', label: 'NR at 1x', align: 'right', render: (v) => formatCurrency(v) },
    { key: 'extra_nr_vs_1x', label: 'Extra vs 1x', align: 'right', render: (v) => nrCell(v) },
    { key: 'max_observed_posts_wk', label: 'Max Obs', align: 'center', render: (v) => v ? `${v}x` : '--' },
    { key: 'nr_curve', label: 'NR Curve', sortable: false, width: '200px', render: (v) => v ? <span className="text-xs text-[#888] font-mono">{v}</span> : '--' },
  ];
  return (
    <div>
      {chartData && (
        <div className="mb-6 glass rounded-xl p-5 gradient-border">
          <h3 className="text-sm font-semibold text-white mb-3">Sample NR Curve: {chartData.label}</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="frequency" stroke="#666" tick={{ fill: '#999', fontSize: 12 }} />
                <YAxis stroke="#666" tick={{ fill: '#999', fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip {...TT_STYLE} formatter={(v) => [`$${v.toFixed(2)}`, 'Weekly NR']} />
                <Line type="monotone" dataKey="nr" stroke="#1E8449" strokeWidth={2} dot={{ fill: '#1E8449', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <DataTable columns={cols} data={rows} searchable searchPlaceholder="Search locations, titles..." searchFields={['location', 'title', 'category']}
        rowClassName={(row) => row.optimal_posts_per_week > 1 ? '!bg-[#1E8449]/5' : ''}
        onRowClick={(row) => navigate(`/location/${encodeURIComponent(row.location)}`)} emptyMessage="No frequency data available" />
    </div>
  );
}

function TrendsTab({ data }) {
  const [selLocs, setSelLocs] = useState([]);
  const allRuns = useMemo(() => {
    if (!data?.all_runs) return [];
    const runs = Array.isArray(data.all_runs) ? data.all_runs : Object.values(data.all_runs);
    return runs.map((r) => ({
      location: r.Location || r.location || '', d1_date: r.D1_Date || r.d1_date || r.d1__date || '',
      total_nr: parseFloat(r.Total_NR || r.total_nr || r.total__n_r || 0),
    })).filter((r) => r.location && r.d1_date);
  }, [data]);
  const locsByNR = useMemo(() => {
    const m = {}; allRuns.forEach((r) => { m[r.location] = (m[r.location] || 0) + r.total_nr; });
    return Object.entries(m).sort(([, a], [, b]) => b - a).map(([l]) => l);
  }, [allRuns]);
  const active = useMemo(() => selLocs.length > 0 ? selLocs : locsByNR.slice(0, 5), [selLocs, locsByNR]);
  const weeklyAgg = useMemo(() => {
    const wm = {};
    allRuns.forEach((r) => { if (!active.includes(r.location)) return; const d = parseDate(r.d1_date); if (!d) return;
      const wk = getWeekKey(d); if (!wm[wk]) wm[wk] = { week: wk, total_nr: 0, runs: 0 }; wm[wk].total_nr += r.total_nr; wm[wk].runs += 1; });
    return Object.values(wm).sort((a, b) => a.week.localeCompare(b.week));
  }, [allRuns, active]);
  const perLoc = useMemo(() => {
    const wm = {};
    allRuns.forEach((r) => { if (!active.includes(r.location)) return; const d = parseDate(r.d1_date); if (!d) return;
      const wk = getWeekKey(d); if (!wm[wk]) wm[wk] = { week: wk }; wm[wk][r.location] = (wm[wk][r.location] || 0) + r.total_nr; });
    return Object.values(wm).sort((a, b) => a.week.localeCompare(b.week));
  }, [allRuns, active]);
  function toggle(loc) {
    setSelLocs((prev) => {
      const base = prev.length === 0 ? locsByNR.slice(0, 5) : prev;
      return base.includes(loc) ? base.filter((l) => l !== loc) : base.length < 5 ? [...base, loc] : base;
    });
  }
  if (allRuns.length === 0) return <div className="glass rounded-xl p-12 text-center text-[#555] gradient-border">No historical run data available.</div>;
  return (
    <div>
      <p className="text-sm text-[#666] mb-4">{locsByNR.length} locations, {allRuns.length} runs -- select up to 5</p>
      <div className="glass rounded-xl p-4 mb-6 gradient-border">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-[#8B86E0] uppercase tracking-wider">Locations</span>
          <button onClick={() => setSelLocs([])} className="text-xs text-[#666] hover:text-white transition-colors">Reset</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {locsByNR.map((loc) => {
            const on = active.includes(loc), ci = active.indexOf(loc);
            return (
              <button key={loc} onClick={() => toggle(loc)}
                className={`px-2.5 py-1 rounded-md text-xs transition-all border ${on ? 'border-[#5A54BD]/40 text-white font-medium' : 'border-transparent text-[#666] hover:text-[#999] hover:bg-white/[0.03]'}`}
                style={on && ci >= 0 ? { backgroundColor: `${CHART_COLORS[ci % CHART_COLORS.length]}20` } : {}}>
                {on && ci >= 0 && <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: CHART_COLORS[ci % CHART_COLORS.length] }} />}
                {loc}
              </button>
            );
          })}
        </div>
      </div>
      <div className="glass rounded-xl p-5 mb-6 gradient-border">
        <h3 className="text-sm font-semibold text-white mb-4">Weekly Aggregated NR</h3>
        {weeklyAgg.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={weeklyAgg} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="week" tick={{ fill: '#666', fontSize: 11 }} tickFormatter={fmtShort} stroke="rgba(255,255,255,0.1)" />
              <YAxis tick={{ fill: '#666', fontSize: 11 }} tickFormatter={fmtY} stroke="rgba(255,255,255,0.1)" />
              <Tooltip {...TT_STYLE} labelFormatter={(v) => `Week of ${fmtShort(v)}`} formatter={(v) => [formatCurrency(v), 'Total NR']} />
              <Bar dataKey="total_nr" fill="#5A54BD" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        ) : <div className="text-center text-[#555] py-12">No weekly data for selected locations</div>}
      </div>
      {perLoc.length > 0 && active.length > 0 && (
        <div className="glass rounded-xl p-5 gradient-border">
          <h3 className="text-sm font-semibold text-white mb-4">NR by Location (Weekly)</h3>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={perLoc} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="week" tick={{ fill: '#666', fontSize: 11 }} tickFormatter={fmtShort} stroke="rgba(255,255,255,0.1)" />
              <YAxis tick={{ fill: '#666', fontSize: 11 }} tickFormatter={fmtY} stroke="rgba(255,255,255,0.1)" />
              <Tooltip {...TT_STYLE} labelFormatter={(v) => `Week of ${fmtShort(v)}`} formatter={(v, name) => [formatCurrency(v), name]} />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#999' }} />
              {active.map((loc, i) => <Line key={loc} type="monotone" dataKey={loc} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3, strokeWidth: 0 }} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
