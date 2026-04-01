import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import {
  Upload as UploadIcon,
  ArrowRight,
  ArrowLeft,
  X,
  Zap,
  Heart,
  Monitor,
  ShoppingBag,
  Truck,
  MoreHorizontal,
  CheckCircle2,
  Loader2,
  FileSpreadsheet,
  DollarSign,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { uploadFile } from '../utils/api';
import { useAnalysis } from '../context/AnalysisContext';

const PROCESSING_STEPS = [
  'Converting cumulative to daily values...',
  'Building location-specific multipliers...',
  'Analysing title and category performance per location...',
  'Computing best posting day per location...',
  'Running repost classification (Triggers 1 and 2)...',
  'Optimising weekly frequency...',
  'Building daily action plan...',
  'Done!',
];

const CATEGORIES = [
  { id: 'gig_work', label: 'Gig Work', icon: Zap },
  { id: 'healthcare', label: 'Healthcare', icon: Heart },
  { id: 'technology', label: 'Technology', icon: Monitor },
  { id: 'retail', label: 'Retail', icon: ShoppingBag },
  { id: 'logistics', label: 'Logistics', icon: Truck },
  { id: 'other', label: 'Other', icon: MoreHorizontal },
];

const GEO_OPTIONS = [
  { value: 'us_national', label: 'US National' },
  { value: 'us_east', label: 'East Coast' },
  { value: 'us_west', label: 'West Coast' },
  { value: 'us_south', label: 'South' },
  { value: 'us_midwest', label: 'Midwest' },
  { value: 'specific', label: 'Specific States' },
];

const STEP_LABELS = ['Upload', 'Pricing', 'Context', 'Analyse'];

export default function Upload() {
  const navigate = useNavigate();
  const { loadAnalysis } = useAnalysis();
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  // Wizard state
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [costPerApply, setCostPerApply] = useState('1.00');
  const [marginPct, setMarginPct] = useState('20');
  const [clientName, setClientName] = useState('');
  const [jobCategory, setJobCategory] = useState('');
  const [competitors, setCompetitors] = useState([]);
  const [competitorInput, setCompetitorInput] = useState('');
  const [targetGeo, setTargetGeo] = useState('us_national');
  const [monthlyBudget, setMonthlyBudget] = useState(5000);
  const [uploading, setUploading] = useState(false);
  const [currentProcessingStep, setCurrentProcessingStep] = useState(-1);
  const [error, setError] = useState(null);

  const sellCpa = (parseFloat(costPerApply || '0') * (1 + parseFloat(marginPct || '0') / 100)).toFixed(2);

  // --- File handling ---
  const handleFile = useCallback((f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setError('Please upload an Excel file (.xlsx, .xls) or CSV (.csv)');
      return;
    }
    setFile(f);
    setError(null);
  }, []);

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // --- Competitor tag input ---
  function handleCompetitorKeyDown(e) {
    if (e.key === 'Enter' && competitorInput.trim()) {
      e.preventDefault();
      setCompetitors((prev) => [...prev, competitorInput.trim()]);
      setCompetitorInput('');
    }
  }

  // --- Upload / analyse ---
  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setCurrentProcessingStep(0);

    const stepInterval = setInterval(() => {
      setCurrentProcessingStep((prev) => {
        if (prev < PROCESSING_STEPS.length - 2) return prev + 1;
        return prev;
      });
    }, 1500);

    try {
      const cpaValue = parseFloat(sellCpa) || 1.2;
      const campaignContext = {
        client_name: clientName,
        job_category: jobCategory,
        competitors: competitors.join(', '),
        target_geography: targetGeo,
        monthly_budget: monthlyBudget || 0,
      };
      const data = await uploadFile(file, undefined, cpaValue, campaignContext);
      clearInterval(stepInterval);
      setCurrentProcessingStep(PROCESSING_STEPS.length - 1);
      loadAnalysis(data);

      const sessionId = `cg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      posthog.identify(sessionId);
      posthog.capture('file_uploaded', {
        rows: data?.daily_action_plan?.length || 0,
        locations: [...new Set((data?.daily_action_plan || []).map((r) => r.location))].length,
        runs: data?.all_runs?.length || 0,
        sell_cpa: cpaValue,
      });

      setTimeout(() => navigate('/action-plan'), 800);
    } catch (err) {
      clearInterval(stepInterval);
      setCurrentProcessingStep(-1);
      setError(err.response?.data?.detail || err.message || 'Upload failed. Check your file format and try again.');
      setUploading(false);
    }
  }

  // --- Shared input classes ---
  const inputCls =
    'w-full px-3 py-2.5 bg-[#0a0a0a]/60 border border-[rgba(90,84,189,0.15)] rounded-lg text-sm text-white focus:outline-none focus:border-[#5A54BD]/50 focus:ring-1 focus:ring-[#5A54BD]/20 transition-all placeholder:text-[#333]';
  const labelCls = 'text-[10px] uppercase tracking-wider text-[#555] mb-1.5 block font-medium';

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6 aurora-bg">
      <div className="w-full max-w-[640px] relative z-10 page-enter">

        {/* ---- Step Indicator ---- */}
        <div className="flex items-center justify-center gap-1 mb-10" role="navigation" aria-label="Wizard progress">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-1">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                    step === s
                      ? 'bg-[#5A54BD] text-white shadow-lg shadow-[#5A54BD]/30'
                      : step > s
                      ? 'bg-[#1E8449] text-white'
                      : 'bg-[#1a1a2a] text-[#555]'
                  }`}
                  aria-current={step === s ? 'step' : undefined}
                >
                  {step > s ? '\u2713' : s}
                </div>
                <span className={`text-[9px] font-medium ${step === s ? 'text-[#8B86E0]' : step > s ? 'text-[#1E8449]' : 'text-[#444]'}`}>
                  {STEP_LABELS[s - 1]}
                </span>
              </div>
              {s < 4 && (
                <div className={`w-12 h-0.5 mb-4 transition-colors duration-300 ${step > s ? 'bg-[#1E8449]' : 'bg-[#1a1a2a]'}`} />
              )}
            </div>
          ))}
        </div>

        {/* ================================================================ */}
        {/* STEP 1 -- Campaign Data Upload                                   */}
        {/* ================================================================ */}
        {step === 1 && (
          <div className="page-enter">
            {/* Hero */}
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#5A54BD] to-[#6BB3CD] mb-6 shadow-lg shadow-[#5A54BD]/25 header-icon">
                <UploadIcon size={26} className="text-white" />
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">CG Automation</h1>
              <p className="text-[#666] mt-2.5 text-sm leading-relaxed max-w-md mx-auto">
                Upload your Craigslist campaign data to get location-specific posting recommendations
              </p>
            </div>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => !file && fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); !file && fileInputRef.current?.click(); } }}
              aria-label={file ? `Selected file: ${file.name}` : 'Drop your file here or click to browse'}
              className={`relative rounded-2xl text-center transition-all duration-300 cursor-pointer drop-zone ${
                dragOver
                  ? 'drop-zone-active p-14 scale-[1.01]'
                  : file
                  ? 'drop-zone-success p-10'
                  : 'drop-zone-idle p-12 hover:drop-zone-hover'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => handleFile(e.target.files[0])}
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
              />
              {file ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#1E8449]/12 flex items-center justify-center file-icon-enter">
                    <CheckCircle2 size={28} className="text-[#1E8449]" />
                  </div>
                  <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-xl bg-[#1E8449]/8 border border-[#1E8449]/20">
                    <FileSpreadsheet size={16} className="text-[#1E8449] shrink-0" />
                    <div className="text-left">
                      <p className="text-white text-sm font-medium leading-tight">{file.name}</p>
                      <p className="text-[#1E8449]/70 text-xs mt-0.5">{formatFileSize(file.size)}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="ml-1 p-1 rounded-lg hover:bg-white/5 text-[#666] hover:text-white transition-colors"
                      aria-label="Remove selected file"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#5A54BD]/10 flex items-center justify-center upload-icon-pulse">
                    <UploadIcon size={26} className="text-[#5A54BD]" />
                  </div>
                  <div>
                    <p className="text-white font-medium text-base">Drop your file here</p>
                    <p className="text-[#555] text-sm mt-1.5">or click to browse</p>
                  </div>
                  <p className="text-[#333] text-xs mt-1">Accepts .xlsx, .xls, and .csv files</p>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="mt-4 flex items-start gap-3 bg-[#C0392B]/8 border border-[#C0392B]/15 rounded-xl p-4 text-sm text-[#E74C3C]" role="alert">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            {/* Next */}
            <button
              onClick={() => { setError(null); setStep(2); }}
              disabled={!file}
              className={`mt-8 w-full py-4 rounded-2xl text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${
                file
                  ? 'cta-gradient text-white hover:shadow-xl active:scale-[0.99]'
                  : 'bg-[#161B2E]/60 text-[#444] cursor-not-allowed border border-[rgba(90,84,189,0.06)]'
              }`}
            >
              Next <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 2 -- Revenue & Pricing                                      */}
        {/* ================================================================ */}
        {step === 2 && (
          <div className="page-enter">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#5A54BD]/12 mb-4">
                <DollarSign size={22} className="text-[#5A54BD]" />
              </div>
              <h2 className="text-xl font-bold text-white">Revenue & Pricing</h2>
              <p className="text-[#555] text-sm mt-1.5">Configure your cost model to calculate revenue metrics</p>
            </div>

            <div className="gradient-border glass-strong rounded-2xl p-6 space-y-5">
              {/* Cost per Apply */}
              <div>
                <label className={labelCls}>Cost per Apply ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555] text-sm font-medium">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={costPerApply}
                    onChange={(e) => setCostPerApply(e.target.value)}
                    className={`${inputCls} pl-7`}
                    aria-label="Cost per apply in dollars"
                  />
                </div>
              </div>

              {/* Margin */}
              <div>
                <label className={labelCls}>Margin (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={marginPct}
                    onChange={(e) => setMarginPct(e.target.value)}
                    className={`${inputCls} pr-8`}
                    aria-label="Margin percentage"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] text-sm font-medium">%</span>
                </div>
              </div>

              {/* Sell CPA (computed) */}
              <div className="pt-3 border-t border-[rgba(90,84,189,0.1)]">
                <label className={labelCls}>Sell CPA (auto-calculated)</label>
                <div className="py-3 px-4 rounded-xl text-lg font-bold sell-cpa-result text-center tracking-wide">
                  ${sellCpa}
                </div>
              </div>

              <p className="text-[11px] text-[#555] leading-relaxed">
                GR = Applies x Sell CPA. NR = GR - Media Cost.
              </p>
            </div>

            {/* Nav */}
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-4 rounded-2xl text-sm font-semibold border border-[rgba(90,84,189,0.2)] text-[#888] hover:text-white hover:border-[#5A54BD]/40 transition-all flex items-center justify-center gap-2"
              >
                <ArrowLeft size={16} /> Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex-[2] py-4 rounded-2xl text-sm font-semibold cta-gradient text-white hover:shadow-xl active:scale-[0.99] transition-all flex items-center justify-center gap-2"
              >
                Next <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 3 -- Campaign Context (Optional)                            */}
        {/* ================================================================ */}
        {step === 3 && (
          <div className="page-enter">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#6BB3CD]/12 mb-4">
                <Sparkles size={22} className="text-[#6BB3CD]" />
              </div>
              <h2 className="text-xl font-bold text-white">Campaign Context</h2>
              <p className="text-[#555] text-sm mt-1.5">Optional -- improves AI-powered insights</p>
            </div>

            <div className="gradient-border glass-strong rounded-2xl p-6 space-y-5">
              {/* Client Name */}
              <div>
                <label className={labelCls}>Client Name</label>
                <input
                  type="text"
                  placeholder="e.g., Apex Group"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className={inputCls}
                  aria-label="Client name"
                />
              </div>

              {/* Job Category -- card grid */}
              <div>
                <label className={labelCls}>Job Category</label>
                <div className="grid grid-cols-3 gap-2.5">
                  {CATEGORIES.map(({ id, label, icon: Icon }) => {
                    const selected = jobCategory === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setJobCategory(selected ? '' : id)}
                        className={`relative flex flex-col items-center gap-2 py-4 px-2 rounded-xl border transition-all duration-200 text-center ${
                          selected
                            ? 'border-[#5A54BD] bg-[#5A54BD]/10 shadow-[0_0_12px_rgba(90,84,189,0.15)]'
                            : 'border-[rgba(90,84,189,0.1)] bg-[#0a0a0a]/40 hover:border-[rgba(90,84,189,0.25)] hover:bg-[#0a0a0a]/60'
                        }`}
                        aria-pressed={selected}
                        aria-label={label}
                      >
                        {selected && (
                          <div className="absolute top-1.5 right-1.5">
                            <CheckCircle2 size={12} className="text-[#5A54BD]" />
                          </div>
                        )}
                        <Icon size={20} className={selected ? 'text-[#8B86E0]' : 'text-[#555]'} />
                        <span className={`text-xs font-medium ${selected ? 'text-[#8B86E0]' : 'text-[#888]'}`}>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Competitors -- tag input */}
              <div>
                <label className={labelCls}>Competitors</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {competitors.map((c, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#5A54BD]/15 text-[#8B86E0] text-xs"
                    >
                      {c}
                      <button
                        type="button"
                        onClick={() => setCompetitors((prev) => prev.filter((_, j) => j !== i))}
                        className="hover:text-red-400 transition-colors"
                        aria-label={`Remove ${c}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Type a competitor and press Enter"
                  value={competitorInput}
                  onChange={(e) => setCompetitorInput(e.target.value)}
                  onKeyDown={handleCompetitorKeyDown}
                  className={inputCls}
                  aria-label="Add competitor"
                />
              </div>

              {/* Target Geography */}
              <div>
                <label className={labelCls}>Target Geography</label>
                <select
                  value={targetGeo}
                  onChange={(e) => setTargetGeo(e.target.value)}
                  className={`${inputCls} appearance-none`}
                  aria-label="Target geography"
                >
                  {GEO_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Monthly Budget -- range slider */}
              <div>
                <label className={labelCls}>Monthly Budget</label>
                <input
                  type="range"
                  min={1000}
                  max={50000}
                  step={1000}
                  value={monthlyBudget}
                  onChange={(e) => setMonthlyBudget(Number(e.target.value))}
                  className="w-full accent-[#5A54BD] mt-1"
                  aria-label="Monthly budget slider"
                />
                <div className="flex justify-between text-[10px] text-[#555] mt-1">
                  <span>$1,000</span>
                  <span className="text-[#6BB3CD] font-semibold text-xs">${monthlyBudget.toLocaleString()}</span>
                  <span>$50,000</span>
                </div>
              </div>
            </div>

            {/* Nav */}
            <div className="flex gap-3 mt-8 items-center">
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-4 rounded-2xl text-sm font-semibold border border-[rgba(90,84,189,0.2)] text-[#888] hover:text-white hover:border-[#5A54BD]/40 transition-all flex items-center justify-center gap-2"
              >
                <ArrowLeft size={16} /> Back
              </button>
              <button
                onClick={() => setStep(4)}
                className="flex-[2] py-4 rounded-2xl text-sm font-semibold cta-gradient text-white hover:shadow-xl active:scale-[0.99] transition-all flex items-center justify-center gap-2"
              >
                Next <ArrowRight size={16} />
              </button>
            </div>
            <button
              onClick={() => setStep(4)}
              className="w-full mt-3 text-center text-xs text-[#555] hover:text-[#888] transition-colors py-2"
            >
              Skip this step
            </button>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 4 -- Review & Analyse                                       */}
        {/* ================================================================ */}
        {step === 4 && (
          <div className="page-enter">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-[#5A54BD] to-[#6BB3CD] mb-4 shadow-lg shadow-[#5A54BD]/20">
                <Sparkles size={22} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-white">Review & Analyse</h2>
              <p className="text-[#555] text-sm mt-1.5">Confirm your inputs and run the analysis</p>
            </div>

            {/* Summary card */}
            {!uploading && (
              <>
                <div className="gradient-border glass-strong rounded-2xl p-5 space-y-3 text-sm">
                  {/* File */}
                  <div className="flex items-center justify-between">
                    <span className="text-[#555]">File</span>
                    <span className="text-white font-medium flex items-center gap-2">
                      <FileSpreadsheet size={14} className="text-[#1E8449]" />
                      {file?.name}
                      <span className="text-[#555] text-xs">({formatFileSize(file?.size || 0)})</span>
                    </span>
                  </div>
                  <div className="h-px bg-[rgba(90,84,189,0.08)]" />
                  {/* Pricing */}
                  <div className="flex items-center justify-between">
                    <span className="text-[#555]">Sell CPA</span>
                    <span className="text-[#6BB3CD] font-bold">${sellCpa}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#555]">Cost / Margin</span>
                    <span className="text-[#888]">${costPerApply} + {marginPct}%</span>
                  </div>
                  <div className="h-px bg-[rgba(90,84,189,0.08)]" />
                  {/* Context */}
                  {clientName && (
                    <div className="flex items-center justify-between">
                      <span className="text-[#555]">Client</span>
                      <span className="text-white">{clientName}</span>
                    </div>
                  )}
                  {jobCategory && (
                    <div className="flex items-center justify-between">
                      <span className="text-[#555]">Category</span>
                      <span className="text-white">{CATEGORIES.find((c) => c.id === jobCategory)?.label || jobCategory}</span>
                    </div>
                  )}
                  {competitors.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-[#555]">Competitors</span>
                      <span className="text-white">{competitors.join(', ')}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[#555]">Geography</span>
                    <span className="text-white">{GEO_OPTIONS.find((g) => g.value === targetGeo)?.label}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#555]">Budget</span>
                    <span className="text-white">${monthlyBudget.toLocaleString()}/mo</span>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="mt-4 flex items-start gap-3 bg-[#C0392B]/8 border border-[#C0392B]/15 rounded-xl p-4 text-sm text-[#E74C3C]" role="alert">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    {error}
                  </div>
                )}

                {/* Analyse button */}
                <button
                  onClick={handleUpload}
                  className="mt-8 w-full py-4 rounded-2xl text-sm font-semibold cta-gradient text-white hover:shadow-xl active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                >
                  Analyse Campaign Data <Sparkles size={16} />
                </button>

                {/* Back */}
                <button
                  onClick={() => setStep(3)}
                  className="w-full mt-3 py-3 rounded-2xl text-sm font-semibold border border-[rgba(90,84,189,0.2)] text-[#888] hover:text-white hover:border-[#5A54BD]/40 transition-all flex items-center justify-center gap-2"
                >
                  <ArrowLeft size={16} /> Back
                </button>
              </>
            )}

            {/* Processing timeline */}
            {uploading && (
              <div className="glass-strong rounded-2xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <Loader2 size={18} className="text-[#5A54BD] animate-spin" />
                  <h3 className="text-base font-semibold text-white">Processing your data</h3>
                </div>
                <div className="relative ml-2">
                  <div className="absolute left-[9px] top-2 bottom-2 w-px bg-[#1a1a2e]" aria-hidden="true" />
                  <div className="space-y-1">
                    {PROCESSING_STEPS.map((label, i) => {
                      const isDone = i < currentProcessingStep || (i === PROCESSING_STEPS.length - 1 && currentProcessingStep === PROCESSING_STEPS.length - 1);
                      const isActive = i === currentProcessingStep && i < PROCESSING_STEPS.length - 1;
                      const isPending = i > currentProcessingStep;

                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-4 py-2 transition-all duration-500 ${isPending ? 'opacity-20' : ''}`}
                        >
                          <div className="relative z-10 shrink-0">
                            {isDone ? (
                              <div className="w-5 h-5 rounded-full bg-[#1E8449]/15 flex items-center justify-center step-done">
                                <CheckCircle2 size={14} className="text-[#1E8449]" />
                              </div>
                            ) : isActive ? (
                              <div className="w-5 h-5 rounded-full bg-[#5A54BD]/15 flex items-center justify-center">
                                <Loader2 size={12} className="text-[#5A54BD] animate-spin" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full border border-[#2a2a3a] bg-[#0a0a0a]" />
                            )}
                          </div>
                          <span
                            className={`text-sm transition-colors duration-300 ${
                              isDone ? 'text-[#1E8449]' : isActive ? 'text-white font-medium' : 'text-[#333]'
                            }`}
                          >
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {error && (
                  <div className="mt-6 flex items-start gap-3 bg-[#C0392B]/8 border border-[#C0392B]/15 rounded-xl p-4 text-sm text-[#E74C3C]" role="alert">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    {error}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
