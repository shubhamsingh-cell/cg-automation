export default function KPITile({ label, value, sub, icon: Icon, color = 'text-white' }) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-[#666] uppercase tracking-wider">{label}</span>
        {Icon && <Icon size={16} className="text-[#444]" />}
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-[#666] mt-1">{sub}</div>}
    </div>
  );
}
