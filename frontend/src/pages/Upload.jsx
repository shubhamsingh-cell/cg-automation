import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import { Upload as UploadIcon, FileSpreadsheet, CheckCircle2, Loader2, AlertCircle, X, DollarSign, ChevronDown, Equal } from 'lucide-react';
import { uploadFile } from '../utils/api';
import { useAnalysis } from '../context/AnalysisContext';

const STEPS = [
  'Converting cumulative to daily values...',
  'Building location-specific multipliers...',
  'Analysing title and category performance per location...',
  'Computing best posting day per location...',
  'Running repost classification (Triggers 1 and 2)...',
  'Optimising weekly frequency...',
  'Building daily action plan...',
  'Done!',
];

const REQUIRED_COLUMNS = [
  'Date',
  'Post ID',
  'Title',
  'Location',
  'Category',
  'Template Type',
  'Media Cost ($)',
  'Impressions (Cumul)',
  'Clicks (Cumul)',
  'Applies (Cumul)',
];

export default function Upload() {
  const navigate = useNavigate();
  const { loadAnalysis } = useAnalysis();
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [error, setError] = useState(null);
  const [costPerApply, setCostPerApply] = useState('1.00');
  const [marginPct, setMarginPct] = useState('20');
  const [columnsOpen, setColumnsOpen] = useState(false);
  const sellCpa = (parseFloat(costPerApply || '0') * (1 + parseFloat(marginPct || '0') / 100)).toFixed(2);

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

  function handleDragOver(e) {
    e.preventDefault();
    setDragOver(true);
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setCurrentStep(0);

    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < STEPS.length - 2) return prev + 1;
        return prev;
      });
    }, 1500);

    try {
      const cpaValue = parseFloat(sellCpa) || 1.20;
      const data = await uploadFile(file, undefined, cpaValue);
      clearInterval(stepInterval);
      setCurrentStep(STEPS.length - 1);
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
      setCurrentStep(-1);
      setError(err.response?.data?.detail || err.message || 'Upload failed. Check your file format and try again.');
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6 aurora-bg">
      <div className="w-full max-w-[600px] relative z-10 page-enter">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#5A54BD] to-[#6BB3CD] mb-6 shadow-lg shadow-[#5A54BD]/25 header-icon">
            <UploadIcon size={26} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">CG Automation</h1>
          <p className="text-[#666] mt-2.5 text-sm leading-relaxed max-w-md mx-auto">
            Upload your Craigslist campaign data to get location-specific posting recommendations
          </p>
        </div>

        {/* Upload Zone */}
        {!uploading && (
          <>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
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
                  <div className="file-chip">
                    <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-xl bg-[#1E8449]/8 border border-[#1E8449]/20">
                      <FileSpreadsheet size={16} className="text-[#1E8449] shrink-0" />
                      <div className="text-left">
                        <p className="text-white text-sm font-medium leading-tight">{file.name}</p>
                        <p className="text-[#1E8449]/70 text-xs mt-0.5">{formatFileSize(file.size)}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="ml-1 p-1 rounded-lg hover:bg-white/5 text-[#666] hover:text-white transition-colors"
                        aria-label="Remove selected file"
                      >
                        <X size={14} />
                      </button>
                    </div>
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

            {/* Revenue Configuration */}
            <div className="mt-6 gradient-border glass-strong rounded-2xl p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-7 h-7 rounded-lg bg-[#5A54BD]/12 flex items-center justify-center">
                  <DollarSign size={14} className="text-[#5A54BD]" />
                </div>
                <span className="text-sm font-medium text-[#bbb]">Revenue Configuration</span>
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="text-[10px] uppercase tracking-widest text-[#555] mb-1.5 block font-medium">Cost per Apply</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555] text-sm font-medium">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={costPerApply}
                      onChange={(e) => setCostPerApply(e.target.value)}
                      className="w-full pl-7 pr-3 py-2.5 bg-[#0a0a0a]/60 border border-[rgba(90,84,189,0.15)] rounded-xl text-sm text-white focus:outline-none focus:border-[#5A54BD]/50 focus:ring-1 focus:ring-[#5A54BD]/20 transition-all"
                      aria-label="Cost per apply in dollars"
                    />
                  </div>
                </div>
                <div className="pb-2.5 text-[#444]">
                  <Equal size={16} />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] uppercase tracking-widest text-[#555] mb-1.5 block font-medium">Margin</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={marginPct}
                      onChange={(e) => setMarginPct(e.target.value)}
                      className="w-full pl-3 pr-8 py-2.5 bg-[#0a0a0a]/60 border border-[rgba(90,84,189,0.15)] rounded-xl text-sm text-white focus:outline-none focus:border-[#5A54BD]/50 focus:ring-1 focus:ring-[#5A54BD]/20 transition-all"
                      aria-label="Margin percentage"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] text-sm font-medium">%</span>
                  </div>
                </div>
                <div className="pb-2.5 text-[#444]">
                  <Equal size={16} />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] uppercase tracking-widest text-[#555] mb-1.5 block font-medium">Sell CPA</label>
                  <div className="py-2.5 px-4 rounded-xl text-sm font-semibold sell-cpa-result">
                    ${sellCpa}
                  </div>
                </div>
              </div>
            </div>

            {/* Required Columns - Collapsible */}
            <div className="mt-4">
              <button
                onClick={() => setColumnsOpen(!columnsOpen)}
                className="w-full glass rounded-2xl px-5 py-4 flex items-center justify-between hover:border-[#5A54BD]/20 transition-all group"
                aria-expanded={columnsOpen}
                aria-controls="required-columns-list"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-[#5A54BD]" />
                  <span className="text-sm text-[#888]">
                    <span className="text-white font-medium">{REQUIRED_COLUMNS.length} columns</span> required in your file
                  </span>
                </div>
                <ChevronDown
                  size={16}
                  className={`text-[#555] transition-transform duration-200 group-hover:text-[#888] ${columnsOpen ? 'rotate-180' : ''}`}
                />
              </button>
              <div
                id="required-columns-list"
                className={`overflow-hidden transition-all duration-300 ease-out ${
                  columnsOpen ? 'max-h-60 opacity-100 mt-2' : 'max-h-0 opacity-0'
                }`}
                role="region"
                aria-label="Required columns list"
              >
                <div className="glass-subtle rounded-xl px-5 py-4">
                  <div className="grid grid-cols-2 gap-2.5">
                    {REQUIRED_COLUMNS.map((col) => (
                      <div key={col} className="flex items-center gap-2.5 text-sm text-[#888]">
                        <CheckCircle2 size={13} className="text-[#5A54BD]/50 shrink-0" />
                        {col}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-4 flex items-start gap-3 bg-[#C0392B]/8 border border-[#C0392B]/15 rounded-xl p-4 text-sm text-[#E74C3C]" role="alert">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            {/* Upload Button */}
            <button
              onClick={handleUpload}
              disabled={!file}
              aria-disabled={!file}
              className={`mt-8 w-full py-4 rounded-2xl text-sm font-semibold transition-all duration-300 cta-button ${
                file
                  ? 'cta-gradient text-white hover:shadow-xl active:scale-[0.99]'
                  : 'bg-[#161B2E]/60 text-[#444] cursor-not-allowed border border-[rgba(90,84,189,0.06)]'
              }`}
            >
              {uploading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Processing...
                </span>
              ) : (
                'Analyse Campaign Data'
              )}
            </button>
          </>
        )}

        {/* Processing Steps - Vertical Timeline */}
        {uploading && (
          <div className="glass-strong rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <Loader2 size={18} className="text-[#5A54BD] animate-spin" />
              <h3 className="text-base font-semibold text-white">Processing your data</h3>
            </div>
            <div className="relative ml-2">
              {/* Timeline line */}
              <div className="absolute left-[9px] top-2 bottom-2 w-px bg-[#1a1a2e]" aria-hidden="true" />
              <div className="space-y-1">
                {STEPS.map((step, i) => {
                  const isDone = i < currentStep || (i === STEPS.length - 1 && currentStep === STEPS.length - 1);
                  const isActive = i === currentStep && i < STEPS.length - 1;
                  const isPending = i > currentStep;

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
                        {step}
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
    </div>
  );
}
