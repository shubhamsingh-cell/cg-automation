import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { XCircle } from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import DataTable from '../components/DataTable';
import TierBadge from '../components/TierBadge';
import { formatCurrency, formatPercent, nrColorClass } from '../utils/formatters';

export default function Skip() {
  const navigate = useNavigate();
  const { data } = useAnalysis();

  const rows = useMemo(() => data?.skip || [], [data]);

  const columns = [
    { key: '_i', label: '#', width: '50px', align: 'center', render: (_, __, i) => <span className="text-[#555]">{i + 1}</span> },
    { key: 'location', label: 'Location', render: (v) => <button onClick={() => navigate(`/location/${encodeURIComponent(v)}`)} className="text-[#2E74B5] hover:underline text-left">{v}</button> },
    { key: 'title', label: 'Title', render: (v) => <span className="text-white">{v}</span> },
    { key: 'category', label: 'Category' },
    { key: 'tier', label: 'Tier', width: '80px', render: (v) => <TierBadge tier={v} /> },
    { key: 'cost', label: 'Cost', align: 'right', render: (v) => formatCurrency(v) },
    { key: 'profit_pct', label: 'Profit %', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatPercent(v)}</span> },
    { key: 'est_lifetime_nr', label: 'Est Lifetime NR', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatCurrency(v)}</span> },
    {
      key: 'skip_reason',
      label: 'Skip Reason',
      render: (v, row) => {
        // Orange = lifetime override, Grey = low profit
        const isLifetimeOverride = v?.toLowerCase().includes('lifetime') || (row.est_lifetime_nr != null && row.est_lifetime_nr <= 0);
        return (
          <span className={`text-xs font-medium px-2 py-1 rounded ${
            isLifetimeOverride
              ? 'bg-[#E67E22]/15 text-[#E67E22]'
              : 'bg-[#7F8C8D]/15 text-[#7F8C8D]'
          }`}>
            {v || 'Low profit'}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <XCircle size={20} className="text-[#7F8C8D]" />
        <div>
          <h2 className="text-xl font-bold text-white">Skip</h2>
          <p className="text-sm text-[#666] mt-0.5">{rows.length} combos skipped</p>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-5 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#E67E22]/20 border border-[#E67E22]/30" />
          <span className="text-[#999]">Lifetime NR override (Est Lifetime NR &lt;= $0)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#7F8C8D]/20 border border-[#7F8C8D]/30" />
          <span className="text-[#999]">Low profit (&lt; 10%)</span>
        </span>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        searchable
        searchPlaceholder="Search locations, titles..."
        searchFields={['location', 'title', 'category', 'skip_reason']}
        onRowClick={(row) => navigate(`/location/${encodeURIComponent(row.location)}`)}
        emptyMessage="No combos skipped"
      />
    </div>
  );
}
