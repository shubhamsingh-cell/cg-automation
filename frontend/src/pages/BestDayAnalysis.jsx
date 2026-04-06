import { useMemo } from 'react';
import { Calendar } from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import HeatmapCell from '../components/HeatmapCell';
import { formatCurrency } from '../utils/formatters';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function BestDayAnalysis() {
  const { data } = useAnalysis();

  const heatmapData = useMemo(() => {
    if (!data?.location_intelligence) return [];
    const intel = Array.isArray(data.location_intelligence)
      ? data.location_intelligence
      : Object.values(data.location_intelligence);

    return intel.map((loc) => {
      const dayValues = {};
      loc.day_table?.forEach((d) => {
        dayValues[d.day] = d.avg_total_nr;
      });

      const values = DAYS.map((day) => dayValues[day] ?? null);
      const validValues = values.filter((v) => v != null);
      const maxVal = validValues.length > 0 ? Math.max(...validValues) : null;
      const minVal = validValues.length > 0 ? Math.min(...validValues) : null;

      return {
        location: loc.location,
        best_day: loc.best_day,
        values,
        maxVal,
        minVal,
      };
    }).sort((a, b) => a.location.localeCompare(b.location));
  }, [data]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Calendar size={20} className="text-[#2E74B5]" />
        <div>
          <h2 className="text-xl font-bold text-white">Best Day Analysis</h2>
          <p className="text-sm text-[#666] mt-0.5">Day-of-week heatmap -- avg NR by location and day</p>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-5 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#1E8449]/30" />
          <span className="text-[#999]">Best day (highest avg NR)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#C0392B]/20" />
          <span className="text-[#999]">Worst day (lowest avg NR)</span>
        </span>
      </div>

      <div className="overflow-auto rounded-xl border border-[#2a2a2a]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#0F2037]">
              <th className="px-4 py-3 text-left text-xs font-semibold text-[#8bb8e0] uppercase tracking-wider sticky left-0 bg-[#0F2037] z-20 min-w-[180px]">
                Location
              </th>
              {DAYS.map((day) => (
                <th key={day} className="px-3 py-3 text-center text-xs font-semibold text-[#8bb8e0] uppercase tracking-wider min-w-[100px]">
                  {day.slice(0, 3)}
                </th>
              ))}
              <th className="px-4 py-3 text-center text-xs font-semibold text-[#8bb8e0] uppercase tracking-wider">
                Best Day
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1f1f1f]">
            {heatmapData.length === 0 ? (
              <tr>
                <td colSpan={DAYS.length + 2} className="px-4 py-12 text-center text-[#555]">
                  No day-of-week data available
                </td>
              </tr>
            ) : (
              heatmapData.map((row, i) => (
                <tr key={row.location} className={i % 2 === 0 ? 'bg-[#111]' : 'bg-[#141414]'}>
                  <td className="px-4 py-2 text-white font-medium sticky left-0 bg-inherit z-10">
                    {row.location}
                  </td>
                  {row.values.map((val, j) => (
                    <HeatmapCell
                      key={DAYS[j]}
                      value={val}
                      isMax={val != null && val === row.maxVal}
                      isMin={val != null && val === row.minVal}
                    />
                  ))}
                  <td className="px-4 py-2 text-center">
                    <span className="text-[#1E8449] font-medium text-xs">{row.best_day || '--'}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
