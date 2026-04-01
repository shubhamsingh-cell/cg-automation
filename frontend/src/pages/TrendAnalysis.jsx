import { useMemo, useState } from 'react';
import { TrendingUp, ArrowUpRight, ArrowDownRight, MapPin, Activity } from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import HeatmapCell from '../components/HeatmapCell';
import { formatCurrency } from '../utils/formatters';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const CHART_COLORS = [
  '#5A54BD', '#6BB3CD', '#8B86E0', '#1E8449', '#E67E22',
  '#C0392B', '#2E74B5', '#9B59B6', '#F1C40F', '#1ABC9C',
];

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function getWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayOfWeek = d.getDay();
  const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function getMonthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatShortDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function TrendAnalysis() {
  const { data } = useAnalysis();
  const [selectedLocations, setSelectedLocations] = useState([]);

  // Extract all runs from data
  const allRuns = useMemo(() => {
    if (!data?.all_runs) return [];
    const runs = Array.isArray(data.all_runs) ? data.all_runs : Object.values(data.all_runs);
    return runs
      .map((r) => ({
        location: r.Location || r.location || '',
        title: r.Title || r.title || '',
        category: r.Category || r.category || '',
        d1_date: r.D1_Date || r.d1_date || r.d1__date || '',
        last_date: r.Last_Date || r.last_date || r.last__date || '',
        total_nr: parseFloat(r.Total_NR || r.total_nr || r.total__n_r || 0),
        profit_pct: parseFloat(r.Profit_Pct || r.profit_pct || r.profit__pct || 0),
        run_length: parseInt(r.Run_Length || r.run_length || r.run__length || 0, 10),
        d1_applies: parseFloat(r.D1_Applies || r.d1_applies || r.d1__applies || 0),
      }))
      .filter((r) => r.location && r.d1_date);
  }, [data]);

  // Unique locations sorted by total NR descending
  const locationsByNR = useMemo(() => {
    const locMap = {};
    allRuns.forEach((r) => {
      if (!locMap[r.location]) locMap[r.location] = 0;
      locMap[r.location] += r.total_nr;
    });
    return Object.entries(locMap)
      .sort(([, a], [, b]) => b - a)
      .map(([loc]) => loc);
  }, [allRuns]);

  // Auto-select top 10 on first load
  const activeLocations = useMemo(() => {
    if (selectedLocations.length > 0) return selectedLocations;
    return locationsByNR.slice(0, 10);
  }, [selectedLocations, locationsByNR]);

  // ---- Chart 1: Location NR Timeline ----
  const timelineData = useMemo(() => {
    const dateMap = {};
    allRuns.forEach((r) => {
      if (!activeLocations.includes(r.location)) return;
      const dateKey = r.d1_date.slice(0, 10);
      if (!dateMap[dateKey]) dateMap[dateKey] = { date: dateKey };
      if (!dateMap[dateKey][r.location]) dateMap[dateKey][r.location] = 0;
      dateMap[dateKey][r.location] += r.total_nr;
    });
    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [allRuns, activeLocations]);

  // ---- Chart 2: Weekly NR Aggregation ----
  const weeklyData = useMemo(() => {
    const weekMap = {};
    allRuns.forEach((r) => {
      const d = parseDate(r.d1_date);
      if (!d) return;
      const wk = getWeekKey(d);
      if (!weekMap[wk]) weekMap[wk] = { week: wk, total_nr: 0, runs: 0 };
      weekMap[wk].total_nr += r.total_nr;
      weekMap[wk].runs += 1;
    });
    return Object.values(weekMap).sort((a, b) => a.week.localeCompare(b.week));
  }, [allRuns]);

  // ---- Chart 3: Location Performance Heatmap ----
  const heatmapRows = useMemo(() => {
    const top20 = locationsByNR.slice(0, 20);
    const weeks = [...new Set(allRuns.map((r) => {
      const d = parseDate(r.d1_date);
      return d ? getWeekKey(d) : null;
    }).filter(Boolean))].sort();

    return {
      weeks,
      rows: top20.map((loc) => {
        const weekNR = {};
        allRuns.filter((r) => r.location === loc).forEach((r) => {
          const d = parseDate(r.d1_date);
          if (!d) return;
          const wk = getWeekKey(d);
          if (!weekNR[wk]) weekNR[wk] = 0;
          weekNR[wk] += r.total_nr;
        });
        const values = weeks.map((w) => weekNR[w] ?? null);
        const valid = values.filter((v) => v != null);
        return {
          location: loc,
          values,
          maxVal: valid.length ? Math.max(...valid) : null,
          minVal: valid.length ? Math.min(...valid) : null,
        };
      }),
    };
  }, [allRuns, locationsByNR]);

  // ---- Key Metrics Cards ----
  const metrics = useMemo(() => {
    if (allRuns.length === 0) return null;

    // Monthly NR
    const monthMap = {};
    allRuns.forEach((r) => {
      const d = parseDate(r.d1_date);
      if (!d) return;
      const mk = getMonthKey(d);
      if (!monthMap[mk]) monthMap[mk] = 0;
      monthMap[mk] += r.total_nr;
    });
    const months = Object.keys(monthMap).sort();
    const currentMonth = months[months.length - 1];
    const prevMonth = months.length > 1 ? months[months.length - 2] : null;
    const currentNR = monthMap[currentMonth] || 0;
    const prevNR = prevMonth ? monthMap[prevMonth] : 0;
    const nrChange = prevNR !== 0 ? ((currentNR - prevNR) / Math.abs(prevNR)) * 100 : 0;

    // Best / worst location this month
    const locMonthMap = {};
    allRuns.forEach((r) => {
      const d = parseDate(r.d1_date);
      if (!d) return;
      const mk = getMonthKey(d);
      if (mk !== currentMonth) return;
      if (!locMonthMap[r.location]) locMonthMap[r.location] = 0;
      locMonthMap[r.location] += r.total_nr;
    });
    const locEntries = Object.entries(locMonthMap).sort(([, a], [, b]) => b - a);
    const bestLoc = locEntries[0] || ['--', 0];
    const worstLoc = locEntries[locEntries.length - 1] || ['--', 0];

    // Avg run length
    const avgRunLength = allRuns.reduce((s, r) => s + r.run_length, 0) / allRuns.length;

    return { currentNR, nrChange, bestLoc, worstLoc, avgRunLength };
  }, [allRuns]);

  // Toggle location selection
  function toggleLocation(loc) {
    setSelectedLocations((prev) => {
      const base = prev.length === 0 ? locationsByNR.slice(0, 10) : prev;
      if (base.includes(loc)) {
        return base.filter((l) => l !== loc);
      }
      return [...base, loc];
    });
  }

  function selectAll() {
    setSelectedLocations(locationsByNR.slice(0, 10));
  }

  function clearAll() {
    setSelectedLocations([]);
  }

  if (allRuns.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp size={20} className="text-[#5A54BD]" />
          <h2 className="text-xl font-bold text-white">Trend Analysis</h2>
        </div>
        <div className="glass-card p-12 text-center text-[#555]">
          No historical run data available. Upload data with multiple runs to see trends.
        </div>
      </div>
    );
  }

  const chartTooltipStyle = {
    contentStyle: {
      backgroundColor: '#1a1a2e',
      border: '1px solid rgba(90,84,189,0.3)',
      borderRadius: '8px',
      color: '#ccc',
      fontSize: '12px',
    },
    labelStyle: { color: '#8B86E0' },
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp size={20} className="text-[#5A54BD]" />
        <div>
          <h2 className="text-xl font-bold text-white">Trend Analysis</h2>
          <p className="text-sm text-[#666] mt-0.5">
            Historical NR trends across {locationsByNR.length} locations, {allRuns.length} runs
          </p>
        </div>
      </div>

      {/* Key Metrics Cards */}
      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <MetricCard
            label="Total NR Trend"
            value={formatCurrency(metrics.currentNR)}
            change={metrics.nrChange}
            subtitle="vs previous month"
          />
          <MetricCard
            label="Best Location (Month)"
            value={metrics.bestLoc[0]}
            valueSmall
            subtitle={formatCurrency(metrics.bestLoc[1])}
            icon={<MapPin size={14} className="text-[#1E8449]" />}
          />
          <MetricCard
            label="Worst Location (Month)"
            value={metrics.worstLoc[0]}
            valueSmall
            subtitle={formatCurrency(metrics.worstLoc[1])}
            icon={<MapPin size={14} className="text-[#C0392B]" />}
          />
          <MetricCard
            label="Avg Run Length"
            value={`${metrics.avgRunLength.toFixed(1)} days`}
            icon={<Activity size={14} className="text-[#6BB3CD]" />}
          />
        </div>
      )}

      {/* Location Selector */}
      <div className="glass-card p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-[#8B86E0] uppercase tracking-wider">
            Select Locations for Timeline
          </span>
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-xs text-[#6BB3CD] hover:text-white transition-colors">
              Top 10
            </button>
            <button onClick={clearAll} className="text-xs text-[#666] hover:text-white transition-colors">
              Clear
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {locationsByNR.map((loc, i) => {
            const isActive = activeLocations.includes(loc);
            const colorIdx = activeLocations.indexOf(loc);
            return (
              <button
                key={loc}
                onClick={() => toggleLocation(loc)}
                className={`px-2.5 py-1 rounded-md text-xs transition-all duration-150 border ${
                  isActive
                    ? 'border-[#5A54BD]/40 text-white font-medium'
                    : 'border-transparent text-[#666] hover:text-[#999] hover:bg-white/[0.03]'
                }`}
                style={isActive && colorIdx >= 0 ? { backgroundColor: `${CHART_COLORS[colorIdx % CHART_COLORS.length]}20` } : {}}
              >
                {isActive && colorIdx >= 0 && (
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5"
                    style={{ backgroundColor: CHART_COLORS[colorIdx % CHART_COLORS.length] }}
                  />
                )}
                {loc}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart 1: Location NR Timeline */}
      <div className="glass-card p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-4">Location NR Timeline</h3>
        {timelineData.length > 0 ? (
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={timelineData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#666', fontSize: 11 }}
                tickFormatter={formatShortDate}
                stroke="rgba(255,255,255,0.1)"
              />
              <YAxis
                tick={{ fill: '#666', fontSize: 11 }}
                tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`}
                stroke="rgba(255,255,255,0.1)"
              />
              <Tooltip
                {...chartTooltipStyle}
                labelFormatter={formatShortDate}
                formatter={(value, name) => [formatCurrency(value), name]}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px', color: '#999' }}
              />
              {activeLocations.map((loc, i) => (
                <Line
                  key={loc}
                  type="monotone"
                  dataKey={loc}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center text-[#555] py-12">Select locations to view timeline</div>
        )}
      </div>

      {/* Chart 2: Weekly NR Aggregation */}
      <div className="glass-card p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-4">Weekly NR Aggregation</h3>
        {weeklyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={weeklyData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="week"
                tick={{ fill: '#666', fontSize: 11 }}
                tickFormatter={formatShortDate}
                stroke="rgba(255,255,255,0.1)"
              />
              <YAxis
                tick={{ fill: '#666', fontSize: 11 }}
                tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`}
                stroke="rgba(255,255,255,0.1)"
              />
              <Tooltip
                {...chartTooltipStyle}
                labelFormatter={(v) => `Week of ${formatShortDate(v)}`}
                formatter={(value, name) => {
                  if (name === 'total_nr') return [formatCurrency(value), 'Total NR'];
                  return [value, name];
                }}
              />
              <Bar
                dataKey="total_nr"
                fill="#5A54BD"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center text-[#555] py-12">No weekly data available</div>
        )}
      </div>

      {/* Chart 3: Location Performance Heatmap */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-white mb-4">
          Location Performance Heatmap (Top 20)
        </h3>
        <div className="flex items-center gap-4 mb-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[#1E8449]/30" />
            <span className="text-[#999]">High NR</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[#C0392B]/20" />
            <span className="text-[#999]">Negative NR</span>
          </span>
        </div>
        <div className="overflow-auto rounded-xl border border-[#2a2a2a]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#0F2037]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#8bb8e0] uppercase tracking-wider sticky left-0 bg-[#0F2037] z-20 min-w-[180px]">
                  Location
                </th>
                {heatmapRows.weeks.map((w) => (
                  <th
                    key={w}
                    className="px-3 py-3 text-center text-xs font-semibold text-[#8bb8e0] uppercase tracking-wider min-w-[90px]"
                  >
                    {formatShortDate(w)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f1f1f]">
              {heatmapRows.rows.length === 0 ? (
                <tr>
                  <td colSpan={heatmapRows.weeks.length + 1} className="px-4 py-12 text-center text-[#555]">
                    No heatmap data available
                  </td>
                </tr>
              ) : (
                heatmapRows.rows.map((row, i) => (
                  <tr key={row.location} className={i % 2 === 0 ? 'bg-[#111]' : 'bg-[#141414]'}>
                    <td className="px-4 py-2 text-white font-medium sticky left-0 bg-inherit z-10">
                      {row.location}
                    </td>
                    {row.values.map((val, j) => (
                      <HeatmapCell
                        key={heatmapRows.weeks[j]}
                        value={val}
                        isMax={val != null && val === row.maxVal}
                        isMin={val != null && val === row.minVal}
                      />
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, change, subtitle, icon, valueSmall }) {
  const isPositive = change != null ? change >= 0 : null;

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-[#666] uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className={`font-bold text-white ${valueSmall ? 'text-sm truncate' : 'text-lg'}`}>
        {value}
      </div>
      {change != null && (
        <div className="flex items-center gap-1 mt-1">
          {isPositive ? (
            <ArrowUpRight size={14} className="text-[#1E8449]" />
          ) : (
            <ArrowDownRight size={14} className="text-[#C0392B]" />
          )}
          <span className={`text-xs font-medium ${isPositive ? 'text-[#1E8449]' : 'text-[#C0392B]'}`}>
            {Math.abs(change).toFixed(1)}%
          </span>
          {subtitle && <span className="text-xs text-[#555] ml-1">{subtitle}</span>}
        </div>
      )}
      {change == null && subtitle && (
        <span className="text-xs text-[#555] mt-1 block">{subtitle}</span>
      )}
    </div>
  );
}
