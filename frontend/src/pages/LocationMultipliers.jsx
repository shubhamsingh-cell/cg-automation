import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import DataTable from '../components/DataTable';
import { formatMultiplier } from '../utils/formatters';

export default function LocationMultipliers() {
  const navigate = useNavigate();
  const { data } = useAnalysis();

  const rows = useMemo(() => data?.location_multipliers || [], [data]);

  const columns = [
    { key: '_i', label: '#', width: '50px', align: 'center', render: (_, __, i) => <span className="text-[#555]">{i + 1}</span> },
    { key: 'location', label: 'Location', render: (v) => <button onClick={() => navigate(`/location/${encodeURIComponent(v)}`)} className="text-[#2E74B5] hover:underline text-left">{v}</button> },
    {
      key: 'multiplier',
      label: 'Multiplier',
      align: 'right',
      render: (v) => <span className="text-white font-semibold">{formatMultiplier(v)}</span>,
    },
    {
      key: 'mult_source',
      label: 'Source',
      render: (v) => {
        const isLocation = v?.toLowerCase().includes('location');
        const isCategoryFallback = v?.toLowerCase().includes('category');
        return (
          <span className={`text-xs font-medium px-2 py-1 rounded ${
            isLocation
              ? 'bg-[#2E74B5]/15 text-[#2E74B5]'
              : isCategoryFallback
              ? 'bg-[#E67E22]/15 text-[#E67E22]'
              : 'bg-[#7F8C8D]/15 text-[#7F8C8D]'
          }`}>
            {v || '--'}
          </span>
        );
      },
    },
    { key: 'mult_runs', label: 'Runs Used', align: 'center' },
    { key: 'avg_run_days', label: 'Avg Run Days', align: 'right', render: (v) => v?.toFixed(1) ?? '--' },
  ];

  const stats = useMemo(() => {
    if (!rows.length) return { total: 0, location: 0, category: 0, global: 0 };
    return {
      total: rows.length,
      location: rows.filter((r) => r.mult_source?.toLowerCase().includes('location')).length,
      category: rows.filter((r) => r.mult_source?.toLowerCase().includes('category')).length,
      global: rows.filter((r) => r.mult_source?.toLowerCase().includes('global')).length,
    };
  }, [rows]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <MapPin size={20} className="text-[#2E74B5]" />
        <div>
          <h2 className="text-xl font-bold text-white">Location Multipliers</h2>
          <p className="text-sm text-[#666] mt-0.5">{rows.length} locations with multiplier data</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-5 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#2E74B5]/20 border border-[#2E74B5]/30" />
          <span className="text-[#999]">Location-specific ({stats.location})</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#E67E22]/20 border border-[#E67E22]/30" />
          <span className="text-[#999]">Category fallback ({stats.category})</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#7F8C8D]/20 border border-[#7F8C8D]/30" />
          <span className="text-[#999]">Global fallback ({stats.global})</span>
        </span>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        searchable
        searchPlaceholder="Search locations..."
        searchFields={['location', 'mult_source']}
        onRowClick={(row) => navigate(`/location/${encodeURIComponent(row.location)}`)}
        emptyMessage="No multiplier data available"
      />
    </div>
  );
}
