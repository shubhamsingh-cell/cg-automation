import { getTierConfig } from '../utils/formatters';

export default function TierBadge({ tier }) {
  const config = getTierConfig(tier);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${config.bg} ${config.text} border ${config.border}`}>
      {config.label}
    </span>
  );
}
