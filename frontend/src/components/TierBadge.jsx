import { getTierConfig } from '../utils/formatters';

const glowMap = {
  1: 'glow-green',
  2: 'glow-blue',
  3: 'glow-orange',
  4: 'glow-grey',
};

export default function TierBadge({ tier }) {
  const config = getTierConfig(tier);
  const glow = glowMap[tier] || '';
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${config.bg} ${config.text} border ${config.border} ${glow}`}>
      {config.label}
    </span>
  );
}
