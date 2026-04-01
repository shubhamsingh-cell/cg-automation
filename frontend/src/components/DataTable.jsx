import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Search } from 'lucide-react';

export default function DataTable({
  columns,
  data,
  searchable = false,
  searchPlaceholder = 'Search...',
  searchFields = [],
  rowClassName,
  onRowClick,
  emptyMessage = 'No data available',
  stickyHeader = true,
  maxHeight,
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [search, setSearch] = useState('');

  function handleSort(key) {
    if (!key) return;
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const filtered = useMemo(() => {
    if (!search || !searchFields.length) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      searchFields.some((field) => {
        const val = row[field];
        return val != null && String(val).toLowerCase().includes(q);
      })
    );
  }, [data, search, searchFields]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  return (
    <div className="w-full">
      {searchable && (
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A54BD]/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-10 pr-4 py-2.5 glass rounded-lg text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#5A54BD]/30 transition-colors"
          />
        </div>
      )}

      <div
        className={`overflow-auto rounded-xl border border-[rgba(90,84,189,0.1)] ${maxHeight ? '' : ''}`}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table className="w-full text-sm">
          <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
            <tr className="bg-[#0F1629]">
              {columns.map((col) => (
                <th
                  key={col.key || col.label}
                  onClick={() => col.sortable !== false && col.key && handleSort(col.key)}
                  className={`px-4 py-3 text-left text-xs font-semibold text-[#5A54BD]/70 uppercase tracking-wider whitespace-nowrap border-b border-[rgba(90,84,189,0.1)] ${
                    col.sortable !== false && col.key ? 'cursor-pointer select-none hover:text-[#8B86E0]' : ''
                  } ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}`}
                  style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable !== false && col.key && (
                      <span className="inline-flex flex-col">
                        {sortKey === col.key ? (
                          sortDir === 'asc' ? (
                            <ChevronUp size={12} />
                          ) : (
                            <ChevronDown size={12} />
                          )
                        ) : (
                          <ChevronsUpDown size={10} className="text-[#333]" />
                        )}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(90,84,189,0.06)]">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-[#555]">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sorted.map((row, i) => (
                <tr
                  key={row._key || i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`transition-colors duration-100 ${
                    i % 2 === 0 ? 'bg-[#0a0b14]' : 'bg-[#0e1020]'
                  } ${onRowClick ? 'cursor-pointer hover:bg-[#161B2E]' : 'hover:bg-[#12152a]'} ${
                    rowClassName ? rowClassName(row) : ''
                  }`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key || col.label}
                      className={`px-4 py-3 whitespace-nowrap ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                      }`}
                    >
                      {col.render ? col.render(row[col.key], row, i) : row[col.key] ?? '--'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {sorted.length > 0 && (
        <div className="mt-2 text-xs text-[#444] px-1">
          {sorted.length} {sorted.length === 1 ? 'row' : 'rows'}
          {search && filtered.length !== data.length && ` (filtered from ${data.length})`}
        </div>
      )}
    </div>
  );
}
