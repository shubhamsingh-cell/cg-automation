import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import DataTable from '../components/DataTable';
import { formatCurrency, nrColorClass } from '../utils/formatters';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function FrequencyOptimization() {
  const navigate = useNavigate();
  const { data } = useAnalysis();

  const rows = useMemo(() => {
    if (!data?.frequency_optimization) return [];
    return [...data.frequency_optimization].sort((a, b) => (b.optimal_posts_per_week || 1) - (a.optimal_posts_per_week || 1));
  }, [data]);

  const columns = [
    { key: 'location', label: 'Location', render: (v) => <button onClick={() => navigate(`/location/${encodeURIComponent(v)}`)} className="text-[#2E74B5] hover:underline text-left">{v}</button> },
    { key: 'title', label: 'Title', render: (v) => <span className="text-white">{v}</span> },
    { key: 'category', label: 'Category' },
    {
      key: 'optimal_posts_per_week',
      label: 'Optimal Posts/Wk',
      align: 'center',
      render: (v) => (
        <span className={`font-semibold ${v > 1 ? 'text-[#1E8449]' : 'text-white'}`}>
          {v ? `${v}x` : '--'}
        </span>
      ),
    },
    { key: 'expected_weekly_nr', label: 'Expected Weekly NR', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatCurrency(v)}</span> },
    { key: 'nr_at_1x', label: 'NR at 1x', align: 'right', render: (v) => formatCurrency(v) },
    { key: 'extra_nr_vs_1x', label: 'Extra NR vs 1x', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatCurrency(v)}</span> },
    { key: 'max_observed_posts_wk', label: 'Max Observed', align: 'center', render: (v) => v ? `${v}x` : '--' },
    {
      key: 'nr_curve',
      label: 'NR Curve',
      sortable: false,
      width: '200px',
      render: (v) => {
        if (!v) return '--';
        return <span className="text-xs text-[#888] font-mono">{v}</span>;
      },
    },
  ];

  // Pick a sample combo with multi-frequency data for the chart
  const chartData = useMemo(() => {
    const multiFreq = rows.find((r) => r.optimal_posts_per_week > 1 && r.nr_curve);
    if (!multiFreq?.nr_curve) return null;
    try {
      const pairs = multiFreq.nr_curve.split('|').map((p) => {
        const [freq, nr] = p.trim().split('->');
        return { frequency: freq.trim(), nr: parseFloat(nr.replace('$', '')) };
      });
      return { label: `${multiFreq.location} -- ${multiFreq.title}`, data: pairs };
    } catch {
      return null;
    }
  }, [rows]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp size={20} className="text-[#2E74B5]" />
        <div>
          <h2 className="text-xl font-bold text-white">Frequency Optimization</h2>
          <p className="text-sm text-[#666] mt-0.5">NR curves per combo -- green rows = post more than 1x/week</p>
        </div>
      </div>

      {/* Sample NR Curve Chart */}
      {chartData && (
        <div className="mb-8 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Sample NR Curve: {chartData.label}</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="frequency" stroke="#666" tick={{ fill: '#999', fontSize: 12 }} />
                <YAxis stroke="#666" tick={{ fill: '#999', fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }}
                  labelStyle={{ color: '#999' }}
                  formatter={(v) => [`$${v.toFixed(2)}`, 'Weekly NR']}
                />
                <Line type="monotone" dataKey="nr" stroke="#1E8449" strokeWidth={2} dot={{ fill: '#1E8449', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        searchable
        searchPlaceholder="Search locations, titles..."
        searchFields={['location', 'title', 'category']}
        rowClassName={(row) => row.optimal_posts_per_week > 1 ? '!bg-[#1E8449]/5' : ''}
        onRowClick={(row) => navigate(`/location/${encodeURIComponent(row.location)}`)}
        emptyMessage="No frequency data available"
      />
    </div>
  );
}
