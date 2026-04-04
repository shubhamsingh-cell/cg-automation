import { useState, useMemo, useCallback } from 'react';
import {
  Sparkles, MapPin, Type, FolderOpen, Calendar,
  TrendingUp, Eye, MousePointerClick, Users, DollarSign,
  CheckCircle2, AlertTriangle, XCircle, Loader2, Lightbulb,
  ChevronRight, Star, Clock, BarChart3,
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import { formatCurrency, formatNumber } from '../utils/formatters';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? '' : 'http://localhost:8000');
const api = axios.create({ baseURL: API_URL, timeout: 120000 });

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const VERDICT_CONFIG = {
  POST: {
    bg: 'bg-[#1E8449]/10',
    border: 'border-[#1E8449]/30',
    text: 'text-[#1E8449]',
    badgeBg: 'bg-[#1E8449]',
    icon: CheckCircle2,
    label: 'POST',
  },
  OPTIMIZE: {
    bg: 'bg-[#E67E22]/10',
    border: 'border-[#E67E22]/30',
    text: 'text-[#E67E22]',
    badgeBg: 'bg-[#E67E22]',
    icon: AlertTriangle,
    label: 'OPTIMIZE',
  },
  SKIP: {
    bg: 'bg-[#C0392B]/10',
    border: 'border-[#C0392B]/30',
    text: 'text-[#C0392B]',
    badgeBg: 'bg-[#C0392B]',
    icon: XCircle,
    label: 'SKIP',
  },
};

function ScoreBar({ label, score, max, color }) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[#999] w-28 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2.5 bg-[#1a1a1a] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color || '#5A54BD' }}
        />
      </div>
      <span className="text-xs font-semibold text-white w-14 text-right shrink-0">
        {score.toFixed(1)}/{max}
      </span>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color }) {
  return (
    <div className="glass rounded-xl p-4 gradient-border">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#666]">{label}</span>
        <Icon size={14} className="text-[#5A54BD]/50" />
      </div>
      <div className={`text-xl font-bold ${color || 'text-white'}`}>{value}</div>
    </div>
  );
}

function IntelItem({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02]">
      <div className="w-8 h-8 rounded-lg bg-[#5A54BD]/10 flex items-center justify-center shrink-0">
        <Icon size={14} className="text-[#8B86E0]" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-[#666] uppercase tracking-wider">{label}</div>
        <div className="text-sm text-white font-medium truncate">{value || '--'}</div>
      </div>
    </div>
  );
}

function ChecklistItem({ text, done }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${done ? 'bg-[#1E8449]/20 border-[#1E8449]/40' : 'border-[#333]'}`}>
        {done && <CheckCircle2 size={10} className="text-[#1E8449]" />}
      </div>
      <span className="text-sm text-[#ccc]">{text}</span>
    </div>
  );
}

export default function Predictor() {
  const { data } = useAnalysis();

  // Extract unique locations, titles, categories from analysis data
  const locations = useMemo(() => {
    if (!data?.location_intelligence) return [];
    const intel = Array.isArray(data.location_intelligence)
      ? data.location_intelligence
      : Object.values(data.location_intelligence);
    return intel.map((l) => l.location).filter(Boolean).sort();
  }, [data]);

  const titles = useMemo(() => {
    if (!data?.location_intelligence) return [];
    const intel = Array.isArray(data.location_intelligence)
      ? data.location_intelligence
      : Object.values(data.location_intelligence);
    const set = new Set();
    intel.forEach((loc) => {
      (loc.title_rankings || []).forEach((t) => { if (t.title) set.add(t.title); });
    });
    return [...set].sort();
  }, [data]);

  const categories = useMemo(() => {
    if (!data?.location_intelligence) return [];
    const intel = Array.isArray(data.location_intelligence)
      ? data.location_intelligence
      : Object.values(data.location_intelligence);
    const set = new Set();
    intel.forEach((loc) => {
      (loc.category_rankings || []).forEach((c) => { if (c.category) set.add(c.category); });
    });
    return [...set].sort();
  }, [data]);

  // Form state
  const [location, setLocation] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('');

  // Prediction state
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // LLM analysis state
  const [llmAnalysis, setLlmAnalysis] = useState(null);
  const [llmLoading, setLlmLoading] = useState(false);

  const canPredict = location && title && category && dayOfWeek;

  const handlePredict = useCallback(async () => {
    if (!canPredict) return;
    setLoading(true);
    setError(null);
    setPrediction(null);
    setLlmAnalysis(null);

    try {
      const res = await api.post('/api/predict', { location, title, category, day_of_week: dayOfWeek });
      const pred = res.data;
      setPrediction(pred);

      // Fire async LLM analysis
      setLlmLoading(true);
      api.post('/api/predict-analysis', { prediction: pred })
        .then((r) => setLlmAnalysis(r.data))
        .catch(() => setLlmAnalysis({ error: 'LLM analysis unavailable. The prediction scores above are still valid.' }))
        .finally(() => setLlmLoading(false));
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.error || err.message || 'Prediction failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [canPredict, location, title, category, dayOfWeek]);

  // Derived prediction data
  const verdict = prediction?.verdict || prediction?.decision || 'POST';
  const verdictCfg = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.POST;
  const VerdictIcon = verdictCfg.icon;
  const verdictReason = prediction?.verdict_reason || prediction?.reason || '';

  const metrics = prediction?.metrics || {};
  const scoring = prediction?.scoring || prediction?.factors || [];
  const locationIntel = prediction?.location_intelligence || {};
  const checklist = prediction?.checklist || prediction?.recommendations || [];

  // Empty state
  if (!data) {
    return (
      <div className="page-enter">
        <div className="flex items-center gap-3 mb-6">
          <Sparkles size={22} className="text-[#5A54BD]" />
          <h2 className="text-xl font-bold text-white">Predictor</h2>
        </div>
        <div className="glass rounded-xl p-10 text-center gradient-border">
          <Sparkles size={40} className="text-[#5A54BD]/40 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Upload Data First</h3>
          <p className="text-[#666] text-sm mb-6 max-w-md mx-auto">
            Upload your campaign data to unlock the Predictor. It uses your historical performance data to forecast how a hypothetical post will perform.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Sparkles size={20} className="text-[#5A54BD]" />
        <h2 className="text-xl font-bold text-white">Predictor</h2>
      </div>
      <p className="text-sm text-[#666] mb-6 ml-8">
        Predict performance for a hypothetical Craigslist post
      </p>

      {/* Input Form */}
      <div className="glass rounded-xl p-5 gradient-border mb-8">
        <h3 className="text-sm font-semibold text-white mb-4">Configure Your Post</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {/* Location */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#666] block mb-1.5">
              Location
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#5A54BD]/50 transition-colors"
            >
              <option value="">Select location...</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#666] block mb-1.5">
              Title
            </label>
            <input
              type="text"
              list="title-suggestions"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter post title..."
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#5A54BD]/50 transition-colors"
            />
            <datalist id="title-suggestions">
              {titles.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          {/* Category */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#666] block mb-1.5">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#5A54BD]/50 transition-colors"
            >
              <option value="">Select category...</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Day of Week */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#666] block mb-1.5">
              Day of Week
            </label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#5A54BD]/50 transition-colors"
            >
              <option value="">Select day...</option>
              {DAYS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handlePredict}
          disabled={!canPredict || loading}
          className={`cta-gradient px-6 py-2.5 rounded-lg text-white text-sm font-medium flex items-center gap-2 transition-all ${
            !canPredict || loading ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-lg hover:shadow-[#5A54BD]/20'
          }`}
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Predicting...
            </>
          ) : (
            <>
              <Sparkles size={16} />
              Predict Performance
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="glass rounded-xl p-4 mb-8 border border-[#C0392B]/30 bg-[#C0392B]/5">
          <div className="flex items-center gap-2 text-[#C0392B]">
            <XCircle size={16} />
            <span className="text-sm font-medium">Prediction Error</span>
          </div>
          <p className="text-sm text-[#999] mt-1 ml-6">{error}</p>
        </div>
      )}

      {/* Results */}
      {prediction && (
        <div className="space-y-6">
          {/* A. Verdict Banner */}
          <div className={`rounded-xl p-6 border ${verdictCfg.bg} ${verdictCfg.border} transition-all`}>
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-xl ${verdictCfg.badgeBg} flex items-center justify-center shadow-lg`}>
                <VerdictIcon size={28} className="text-white" />
              </div>
              <div>
                <div className={`text-3xl font-black tracking-tight ${verdictCfg.text}`}>
                  {verdictCfg.label}
                </div>
                {verdictReason && (
                  <p className="text-sm text-[#999] mt-1 max-w-xl">{verdictReason}</p>
                )}
              </div>
            </div>
          </div>

          {/* B. Performance Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon={Eye}
              label="Expected Impressions"
              value={formatNumber(metrics.impressions ?? metrics.expected_impressions ?? 0)}
            />
            <MetricCard
              icon={MousePointerClick}
              label="Expected Clicks"
              value={formatNumber(metrics.clicks ?? metrics.expected_clicks ?? 0)}
            />
            <MetricCard
              icon={Users}
              label="Expected Applies"
              value={formatNumber(metrics.applies ?? metrics.expected_applies ?? 0)}
            />
            <MetricCard
              icon={DollarSign}
              label="Expected NR"
              value={formatCurrency(metrics.nr ?? metrics.expected_nr ?? metrics.total_nr ?? 0)}
              color={
                (metrics.nr ?? metrics.expected_nr ?? metrics.total_nr ?? 0) >= 0
                  ? 'text-[#1E8449]'
                  : 'text-[#C0392B]'
              }
            />
          </div>

          {/* C. Scoring Breakdown */}
          {Array.isArray(scoring) && scoring.length > 0 && (
            <div className="glass rounded-xl p-5 gradient-border">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart3 size={14} className="text-[#5A54BD]" />
                Scoring Breakdown
              </h3>
              <div className="space-y-3">
                {scoring.map((factor, i) => {
                  const colors = ['#5A54BD', '#6BB3CD', '#202058', '#8B86E0', '#1E8449', '#E67E22'];
                  return (
                    <ScoreBar
                      key={factor.name || i}
                      label={factor.name || factor.label || `Factor ${i + 1}`}
                      score={factor.score ?? 0}
                      max={factor.max ?? factor.max_score ?? 10}
                      color={colors[i % colors.length]}
                    />
                  );
                })}
              </div>
              {prediction.total_score != null && (
                <div className="mt-4 pt-4 border-t border-[#222] flex items-center justify-between">
                  <span className="text-xs text-[#666] uppercase tracking-wider font-semibold">Total Score</span>
                  <span className="text-lg font-bold text-white">
                    {prediction.total_score.toFixed(1)}
                    {prediction.max_score != null && (
                      <span className="text-[#555] text-sm font-normal"> / {prediction.max_score}</span>
                    )}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* D. Location Intelligence */}
          {Object.keys(locationIntel).length > 0 && (
            <div className="glass rounded-xl p-5 gradient-border">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <MapPin size={14} className="text-[#5A54BD]" />
                Location Intelligence
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <IntelItem
                  icon={Star}
                  label="Best Title for Location"
                  value={locationIntel.best_title}
                />
                <IntelItem
                  icon={FolderOpen}
                  label="Best Category for Location"
                  value={locationIntel.best_category}
                />
                <IntelItem
                  icon={Calendar}
                  label="Best Day to Post Here"
                  value={locationIntel.best_day}
                />
                <IntelItem
                  icon={TrendingUp}
                  label="Location Multiplier"
                  value={
                    locationIntel.multiplier != null
                      ? `${locationIntel.multiplier.toFixed(2)}x`
                      : '--'
                  }
                />
              </div>
            </div>
          )}

          {/* E. LLM Expert Analysis */}
          <div className="glass rounded-xl p-5 gradient-border">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Lightbulb size={14} className="text-[#5A54BD]" />
              Expert Analysis
            </h3>
            {llmLoading ? (
              <div className="flex items-center gap-3 py-8 justify-center">
                <Loader2 size={20} className="animate-spin text-[#5A54BD]" />
                <span className="text-sm text-[#666]">Generating strategic recommendation...</span>
              </div>
            ) : llmAnalysis ? (
              llmAnalysis.error ? (
                <p className="text-sm text-[#888] py-4">{llmAnalysis.error}</p>
              ) : (
                <div className="prose prose-invert max-w-none">
                  <p className="text-sm text-[#ccc] leading-relaxed whitespace-pre-wrap">
                    {llmAnalysis.analysis || llmAnalysis.recommendation || llmAnalysis.text || JSON.stringify(llmAnalysis)}
                  </p>
                </div>
              )
            ) : (
              <p className="text-sm text-[#555] py-4">Analysis will appear after prediction.</p>
            )}
          </div>

          {/* F. Quick Actions Checklist */}
          {Array.isArray(checklist) && checklist.length > 0 && (
            <div className="glass rounded-xl p-5 gradient-border">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-[#5A54BD]" />
                Recommendations
              </h3>
              <div className="space-y-0.5">
                {checklist.map((item, i) => {
                  const text = typeof item === 'string' ? item : item.text || item.recommendation || '';
                  const done = typeof item === 'object' ? item.done || item.completed : false;
                  return <ChecklistItem key={i} text={text} done={done} />;
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
