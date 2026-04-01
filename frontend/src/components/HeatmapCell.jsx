import { formatCurrency } from '../utils/formatters';

export default function HeatmapCell({ value, isMax, isMin }) {
  if (value == null || isNaN(value)) {
    return <td className="px-3 py-2 text-center text-[#444] text-sm">--</td>;
  }

  let bg = '';
  if (isMax) bg = 'bg-[#1E8449]/20';
  else if (isMin && value < 0) bg = 'bg-[#C0392B]/15';
  else if (value > 0) bg = 'bg-[#1E8449]/8';
  else if (value < 0) bg = 'bg-[#C0392B]/8';

  const textColor = value >= 0 ? 'text-[#1E8449]' : 'text-[#C0392B]';

  return (
    <td className={`px-3 py-2 text-center text-sm font-medium ${bg} ${textColor}`}>
      {formatCurrency(value)}
    </td>
  );
}
