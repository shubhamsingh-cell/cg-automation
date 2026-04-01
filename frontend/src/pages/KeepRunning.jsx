import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle } from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import DataTable from '../components/DataTable';
import TierBadge from '../components/TierBadge';
import { formatCurrency, formatPercent, nrColorClass } from '../utils/formatters';

export default function KeepRunning() {
  const navigate = useNavigate();
  const { data } = useAnalysis();

  const rows = useMemo(() => data?.keep_running || [], [data]);

  const columns = [
    { key: '_i', label: '#', width: '50px', align: 'center', render: (_, __, i) => <span className="text-[#555]">{i + 1}</span> },
    { key: 'location', label: 'Location', render: (v) => <button onClick={() => navigate(`/location/${encodeURIComponent(v)}`)} className="text-[#2E74B5] hover:underline text-left">{v}</button> },
    { key: 'title', label: 'Title', render: (v) => <span className="text-white">{v}</span> },
    { key: 'category', label: 'Category' },
    { key: 'tier', label: 'Tier', width: '80px', render: (v) => <TierBadge tier={v} /> },
    { key: 'cost', label: 'Cost', align: 'right', render: (v) => formatCurrency(v) },
    { key: 'total_nr', label: 'Total NR', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatCurrency(v)}</span> },
    { key: 'profit_pct', label: 'Profit %', align: 'right', render: (v) => <span className={`font-semibold ${nrColorClass(v)}`}>{formatPercent(v)}</span> },
    { key: 'impr_drop_pct', label: 'Impr Drop', align: 'right', render: (v) => formatPercent(v) },
    { key: 'run_days', label: 'Run Days', align: 'center' },
    { key: 'post_id', label: 'Post ID', render: (v) => <span className="text-[#555] text-xs font-mono">{v}</span> },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <PlayCircle size={20} className="text-[#1E8449]" />
        <div>
          <h2 className="text-xl font-bold text-white">Keep Running</h2>
          <p className="text-sm text-[#666] mt-0.5">{rows.length} healthy profitable posts -- do not touch</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        searchable
        searchPlaceholder="Search locations, titles..."
        searchFields={['location', 'title', 'category']}
        onRowClick={(row) => navigate(`/location/${encodeURIComponent(row.location)}`)}
        emptyMessage="No posts currently in Keep Running status"
      />
    </div>
  );
}
