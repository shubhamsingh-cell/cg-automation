import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import TierBadge from '../components/TierBadge';
import DataTable from '../components/DataTable';
import { formatCurrency, formatPercent, formatMultiplier, nrColorClass, getTodayDayName } from '../utils/formatters';

export default function AllRepost() {
  const navigate = useNavigate();
  const { data } = useAnalysis();
  const [tierFilter, setTierFilter] = useState('all');
  const [triggerFilter, setTriggerFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const today = getTodayDayName();

  const rows = useMemo(() => {
    if (!data?.all_repost) return [];
    let filtered = data.all_repost;
    if (tierFilter !== 'all') filtered = filtered.filter((r) => r.tier === Number(tierFilter));
    if (triggerFilter !== 'all') filtered = filtered.filter((r) => r.trigger_reason?.toLowerCase().includes(triggerFilter.toLowerCase()));
    if (categoryFilter !== 'all') filtered = filtered.filter((r) => r.category === categoryFilter);
    return filtered;
  }, [data, tierFilter, triggerFilter, categoryFilter]);

  const triggers = useMemo(() => {
    if (!data?.all_repost) return [];
    const set = new Set(data.all_repost.map((r) => r.trigger_reason).filter(Boolean));
    return [...set];
  }, [data]);

  const categories = useMemo(() => {
    if (!data?.all_repost) return [];
    const set = new Set(data.all_repost.map((r) => r.category).filter(Boolean));
    return [...set].sort();
  }, [data]);

  const columns = [
    { key: '_i', label: '#', width: '50px', align: 'center', render: (_, __, i) => <span className="text-[#555]">{i + 1}</span> },
    { key: 'location', label: 'Location', render: (v) => <button onClick={() => navigate(`/location/${encodeURIComponent(v)}`)} className="text-[#2E74B5] hover:underline text-left">{v}</button> },
    { key: 'title', label: 'Title', render: (v) => <span className="text-white">{v}</span> },
    { key: 'category', label: 'Category' },
    { key: 'tier', label: 'Tier', width: '80px', render: (v) => <TierBadge tier={v} /> },
    { key: 'cost', label: 'Cost', align: 'right', render: (v) => formatCurrency(v) },
    { key: 'profit_pct', label: 'Profit %', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatPercent(v)}</span> },
    { key: 'trigger_reason', label: 'Trigger', render: (v) => <span className="text-xs text-[#999]">{v || '--'}</span> },
    { key: 'd1_applies', label: 'D1 Applies', align: 'right', render: (v) => v?.toFixed(1) ?? '--' },
    { key: 'd1_nr', label: 'D1 NR', align: 'right', render: (v) => <span className={nrColorClass(v)}>{formatCurrency(v)}</span> },
    { key: 'est_lifetime_nr', label: 'Life NR', align: 'right', render: (v) => <span className={`font-semibold ${nrColorClass(v)}`}>{formatCurrency(v)}</span> },
    { key: 'multiplier', label: 'Mult', align: 'right', render: (v) => formatMultiplier(v) },
    { key: 'mult_source', label: 'Source', render: (v) => <span className="text-xs text-[#666]">{v || '--'}</span> },
    { key: 'best_day', label: 'Best Day' },
    { key: 'today_good', label: 'Today?', align: 'center', render: (_, row) => {
      const good = row.best_day?.toLowerCase() === today.toLowerCase();
      return good ? <span className="text-[#1E8449]">Yes</span> : <span className="text-[#E67E22]">No</span>;
    }},
    { key: 'optimal_posts_per_week', label: 'Posts/Wk', align: 'center', render: (v) => v ? `${v}x` : '--' },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <RefreshCw size={20} className="text-[#2E74B5]" />
        <div>
          <h2 className="text-xl font-bold text-white">All Repost Candidates</h2>
          <p className="text-sm text-[#666] mt-0.5">{rows.length} candidates</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <FilterSelect label="Tier" value={tierFilter} onChange={setTierFilter} options={[{ value: 'all', label: 'All Tiers' }, { value: '1', label: 'Tier 1' }, { value: '2', label: 'Tier 2' }, { value: '3', label: 'Tier 3' }, { value: '4', label: 'Tier 4' }]} />
        <FilterSelect label="Trigger" value={triggerFilter} onChange={setTriggerFilter} options={[{ value: 'all', label: 'All Triggers' }, ...triggers.map((t) => ({ value: t, label: t }))]} />
        <FilterSelect label="Category" value={categoryFilter} onChange={setCategoryFilter} options={[{ value: 'all', label: 'All Categories' }, ...categories.map((c) => ({ value: c, label: c }))]} />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        searchable
        searchPlaceholder="Search locations, titles..."
        searchFields={['location', 'title', 'category']}
        onRowClick={(row) => navigate(`/location/${encodeURIComponent(row.location)}`)}
      />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#2E74B5]/50 appearance-none cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
