import { useMemo, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import DataTable from '../components/DataTable';
import { formatCurrency, formatPercent, nrColorClass } from '../utils/formatters';

export default function CategoryAnalysis() {
  const { data } = useAnalysis();
  const [selectedLocation, setSelectedLocation] = useState('');

  const globalCategories = useMemo(() => {
    if (!data?.location_intelligence) return [];
    const catMap = {};
    const intel = Array.isArray(data.location_intelligence)
      ? data.location_intelligence
      : Object.values(data.location_intelligence);

    intel.forEach((loc) => {
      loc.category_table?.forEach((c) => {
        if (!catMap[c.category]) {
          catMap[c.category] = { category: c.category, total_nr: 0, total_profit: 0, total_runs: 0, locations: 0 };
        }
        catMap[c.category].total_nr += (c.avg_total_nr || 0) * (c.runs || 1);
        catMap[c.category].total_profit += (c.avg_profit_pct || 0) * (c.runs || 1);
        catMap[c.category].total_runs += c.runs || 0;
        catMap[c.category].locations += 1;
      });
    });

    return Object.values(catMap).map((c) => ({
      ...c,
      avg_total_nr: c.total_runs > 0 ? c.total_nr / c.total_runs : 0,
      avg_profit_pct: c.total_runs > 0 ? c.total_profit / c.total_runs : 0,
    })).sort((a, b) => b.avg_total_nr - a.avg_total_nr);
  }, [data]);

  const locations = useMemo(() => {
    if (!data?.location_intelligence) return [];
    const intel = Array.isArray(data.location_intelligence)
      ? data.location_intelligence
      : Object.values(data.location_intelligence);
    return intel.map((l) => l.location).filter(Boolean).sort();
  }, [data]);

  const perLocationCategories = useMemo(() => {
    if (!selectedLocation || !data?.location_intelligence) return [];
    const intel = Array.isArray(data.location_intelligence)
      ? data.location_intelligence
      : Object.values(data.location_intelligence);
    const loc = intel.find((l) => l.location === selectedLocation);
    return loc?.category_table || [];
  }, [data, selectedLocation]);

  const globalColumns = [
    { key: 'category', label: 'Category', render: (v) => <span className="text-white">{v}</span> },
    { key: 'total_runs', label: 'Runs', align: 'center' },
    { key: 'locations', label: 'Locations', align: 'center' },
    { key: 'avg_total_nr', label: 'Avg Total NR', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatCurrency(v)}</span> },
    { key: 'avg_profit_pct', label: 'Avg Profit %', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatPercent(v)}</span> },
  ];

  const localColumns = [
    { key: 'category', label: 'Category', render: (v) => <span className="text-white">{v}</span> },
    { key: 'runs', label: 'Runs', align: 'center' },
    { key: 'avg_d1_applies', label: 'Avg D1 Applies', align: 'right', render: (v) => v?.toFixed(2) ?? '--' },
    { key: 'avg_d1_impressions', label: 'Avg D1 Impr', align: 'right', render: (v) => v?.toFixed(1) ?? '--' },
    { key: 'avg_total_nr', label: 'Avg Total NR', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatCurrency(v)}</span> },
    { key: 'avg_profit_pct', label: 'Avg Profit %', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatPercent(v)}</span> },
    { key: 'recommended', label: 'Rec.', align: 'center', render: (v) => v ? <span className="text-[#1E8449] font-bold text-xs">BEST</span> : null },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <FolderOpen size={20} className="text-[#2E74B5]" />
        <h2 className="text-xl font-bold text-white">Category Analysis</h2>
      </div>

      <div className="mb-8">
        <h3 className="text-sm font-semibold text-white mb-3">Global Category Performance</h3>
        <DataTable columns={globalColumns} data={globalCategories} emptyMessage="No category data available" />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Per-Location Category Rankings</h3>
        <select
          value={selectedLocation}
          onChange={(e) => setSelectedLocation(e.target.value)}
          className="mb-4 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#2E74B5]/50 w-full max-w-sm"
        >
          <option value="">Select a location...</option>
          {locations.map((loc) => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>

        {selectedLocation && (
          <DataTable columns={localColumns} data={perLocationCategories} emptyMessage={`No category data for ${selectedLocation}`} />
        )}
      </div>
    </div>
  );
}
