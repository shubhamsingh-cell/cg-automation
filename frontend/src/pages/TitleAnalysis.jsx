import { useMemo, useState } from 'react';
import { Type } from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import DataTable from '../components/DataTable';
import { formatCurrency, formatPercent, nrColorClass } from '../utils/formatters';

export default function TitleAnalysis() {
  const { data } = useAnalysis();
  const [selectedLocation, setSelectedLocation] = useState('');

  const globalTitles = useMemo(() => {
    if (!data?.location_intelligence) return [];
    const titleMap = {};

    // Aggregate from all locations
    const intel = Array.isArray(data.location_intelligence)
      ? data.location_intelligence
      : Object.values(data.location_intelligence);

    intel.forEach((loc) => {
      loc.title_table?.forEach((t) => {
        if (!titleMap[t.title]) {
          titleMap[t.title] = { title: t.title, total_nr: 0, total_profit: 0, total_runs: 0, locations: 0 };
        }
        titleMap[t.title].total_nr += (t.avg_total_nr || 0) * (t.runs || 1);
        titleMap[t.title].total_profit += (t.avg_profit_pct || 0) * (t.runs || 1);
        titleMap[t.title].total_runs += t.runs || 0;
        titleMap[t.title].locations += 1;
      });
    });

    return Object.values(titleMap).map((t) => ({
      ...t,
      avg_total_nr: t.total_runs > 0 ? t.total_nr / t.total_runs : 0,
      avg_profit_pct: t.total_runs > 0 ? t.total_profit / t.total_runs : 0,
    })).sort((a, b) => b.avg_total_nr - a.avg_total_nr);
  }, [data]);

  const locations = useMemo(() => {
    if (!data?.location_intelligence) return [];
    const intel = Array.isArray(data.location_intelligence)
      ? data.location_intelligence
      : Object.values(data.location_intelligence);
    return intel.map((l) => l.location).filter(Boolean).sort();
  }, [data]);

  const perLocationTitles = useMemo(() => {
    if (!selectedLocation || !data?.location_intelligence) return [];
    const intel = Array.isArray(data.location_intelligence)
      ? data.location_intelligence
      : Object.values(data.location_intelligence);
    const loc = intel.find((l) => l.location === selectedLocation);
    return loc?.title_table || [];
  }, [data, selectedLocation]);

  const globalColumns = [
    { key: 'title', label: 'Title', render: (v) => <span className="text-white">{v}</span> },
    { key: 'total_runs', label: 'Runs', align: 'center' },
    { key: 'locations', label: 'Locations', align: 'center' },
    { key: 'avg_total_nr', label: 'Avg Total NR', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatCurrency(v)}</span> },
    { key: 'avg_profit_pct', label: 'Avg Profit %', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatPercent(v)}</span> },
  ];

  const localColumns = [
    { key: 'title', label: 'Title', render: (v) => <span className="text-white">{v}</span> },
    { key: 'runs', label: 'Runs', align: 'center' },
    { key: 'avg_d1_applies', label: 'Avg D1 Applies', align: 'right', render: (v) => v?.toFixed(2) ?? '--' },
    { key: 'avg_total_nr', label: 'Avg Total NR', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatCurrency(v)}</span> },
    { key: 'avg_profit_pct', label: 'Avg Profit %', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatPercent(v)}</span> },
    {
      key: 'recommended',
      label: 'Rec.',
      align: 'center',
      render: (v) => v ? <span className="text-[#1E8449] font-bold text-xs">BEST</span> : null,
    },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Type size={20} className="text-[#2E74B5]" />
        <h2 className="text-xl font-bold text-white">Title Analysis</h2>
      </div>

      {/* Global Table */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-white mb-3">Global Title Performance</h3>
        <DataTable columns={globalColumns} data={globalTitles} emptyMessage="No title data available" />
      </div>

      {/* Per-Location */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Per-Location Title Rankings</h3>
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
          <DataTable columns={localColumns} data={perLocationTitles} emptyMessage={`No title data for ${selectedLocation}`} />
        )}
      </div>
    </div>
  );
}
