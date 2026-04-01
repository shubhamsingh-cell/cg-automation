export function formatCurrency(value) {
  if (value == null || isNaN(value)) return '--';
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function formatPercent(value) {
  if (value == null || isNaN(value)) return '--';
  return `${value.toFixed(1)}%`;
}

export function formatNumber(value, decimals = 0) {
  if (value == null || isNaN(value)) return '--';
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatMultiplier(value) {
  if (value == null || isNaN(value)) return '--';
  return `${value.toFixed(2)}x`;
}

export function nrColorClass(value) {
  if (value == null || isNaN(value)) return '';
  return value >= 0 ? 'text-[#1E8449]' : 'text-[#C0392B]';
}

export function getTierConfig(tier) {
  const tiers = {
    1: { label: 'Tier 1', bg: 'bg-[#1E8449]/20', text: 'text-[#1E8449]', border: 'border-[#1E8449]/30', rowBg: 'bg-[#1E8449]/5' },
    2: { label: 'Tier 2', bg: 'bg-[#2E74B5]/20', text: 'text-[#2E74B5]', border: 'border-[#2E74B5]/30', rowBg: 'bg-[#2E74B5]/5' },
    3: { label: 'Tier 3', bg: 'bg-[#E67E22]/20', text: 'text-[#E67E22]', border: 'border-[#E67E22]/30', rowBg: 'bg-[#E67E22]/5' },
    4: { label: 'Tier 4', bg: 'bg-[#7F8C8D]/20', text: 'text-[#7F8C8D]', border: 'border-[#7F8C8D]/30', rowBg: 'bg-[#7F8C8D]/5' },
  };
  return tiers[tier] || tiers[4];
}

export function getDayName(dayIndex) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayIndex] || dayIndex;
}

export function getTodayDayName() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' });
}
