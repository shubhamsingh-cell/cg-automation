import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import DataTable from '../components/DataTable';
import TierBadge from '../components/TierBadge';
import { formatCurrency, nrColorClass } from '../utils/formatters';

export default function LocationConflicts() {
  const navigate = useNavigate();
  const { data } = useAnalysis();

  const rows = useMemo(() => {
    if (!data?.location_conflicts) return [];
    return data.location_conflicts;
  }, [data]);

  const columns = [
    { key: 'location', label: 'Location', render: (v) => <button onClick={() => navigate(`/location/${encodeURIComponent(v)}`)} className="text-[#2E74B5] hover:underline text-left">{v}</button> },
    { key: 'title', label: 'Filtered Title', render: (v) => <span className="text-white">{v}</span> },
    { key: 'category', label: 'Filtered Category' },
    { key: 'tier', label: 'Tier', width: '80px', render: (v) => <TierBadge tier={v} /> },
    { key: 'est_lifetime_nr', label: 'This NR', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatCurrency(v)}</span> },
    { key: 'winner_title', label: 'Won: Title', render: (v) => <span className="text-[#1E8449]">{v}</span> },
    { key: 'winner_category', label: 'Won: Category', render: (v) => <span className="text-[#1E8449]">{v}</span> },
    { key: 'winner_nr', label: 'Winner NR', align: 'right', render: (v) => <span className={`font-semibold ${nrColorClass(v)}`}>{formatCurrency(v)}</span> },
    { key: 'nr_gap', label: 'NR Gap', align: 'right', render: (v) => <span className="text-[#C0392B] font-medium">{formatCurrency(v)}</span> },
    {
      key: '_lost_to',
      label: 'Lost To',
      sortable: false,
      render: (_, row) => (
        <span className="text-xs text-[#999]">
          Lost to: {row.winner_title} / {row.winner_category} ({formatCurrency(row.winner_nr)} vs {formatCurrency(row.est_lifetime_nr)})
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <AlertTriangle size={20} className="text-[#E67E22]" />
        <div>
          <h2 className="text-xl font-bold text-white">Location Conflicts</h2>
          <p className="text-sm text-[#666] mt-0.5">{rows.length} combos filtered by best-per-location rule</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        searchable
        searchPlaceholder="Search locations..."
        searchFields={['location', 'title', 'category', 'winner_title']}
        onRowClick={(row) => navigate(`/location/${encodeURIComponent(row.location)}`)}
        emptyMessage="No location conflicts -- each location has only one candidate"
      />
    </div>
  );
}
