import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import { Upload as UploadIcon, FileSpreadsheet, CheckCircle2, Loader2, AlertCircle, X, DollarSign } from 'lucide-react';
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
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [error, setError] = useState(null);
  const [costPerApply, setCostPerApply] = useState('1.00');
  const [marginPct, setMarginPct] = useState('20');
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
      <div className="w-full max-w-2xl relative z-10">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#5A54BD] to-[#6BB3CD] mb-5 shadow-lg shadow-[#5A54BD]/20">
            <UploadIcon size={24} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">CG Automation</h1>
          <p className="text-[#666] mt-2 text-sm">
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
              className={`relative rounded-2xl p-12 text-center transition-all duration-300 ${
                dragOver
                  ? 'glass-strong border-[#5A54BD]/50 scale-[1.01] shadow-lg shadow-[#5A54BD]/10'
                  : file
                  ? 'glass border-[#1E8449]/30'
                  : 'glass hover:border-[#5A54BD]/30'
              }`}
              style={dragOver ? { borderStyle: 'dashed', borderWidth: '2px' } : {}}
            >
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => handleFile(e.target.files[0])}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              {file ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#1E8449]/15 flex items-center justify-center">
                    <FileSpreadsheet size={24} className="text-[#1E8449]" />
                  </div>
                  <div>
                    <p className="text-white font-medium">{file.name}</p>
                    <p className="text-[#666] text-xs mt-1">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="text-xs text-[#666] hover:text-white flex items-center gap-1 mt-1 transition-colors"
                  >
                    <X size={12} /> Remove
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#5A54BD]/10 flex items-center justify-center">
                    <UploadIcon size={24} className="text-[#5A54BD]" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Drop your file here</p>
                    <p className="text-[#666] text-xs mt-1">or click to browse</p>
                  </div>
                  <p className="text-[#444] text-[11px] mt-2">Accepts .xlsx and .csv files</p>
                </div>
              )}
            </div>

            {/* Sell CPA Input */}
            <div className="mt-4 glass rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign size={15} className="text-[#5A54BD]" />
                <span className="text-sm text-[#999]">Revenue Configuration</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-[10px] uppercase tracking-wider text-[#555] mb-1 block">Cost per Apply</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666] text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={costPerApply}
                      onChange={(e) => setCostPerApply(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 bg-[#0a0a0a]/60 border border-[rgba(90,84,189,0.15)] rounded-lg text-sm text-white focus:outline-none focus:border-[#5A54BD]/40 transition-colors"
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] uppercase tracking-wider text-[#555] mb-1 block">Margin %</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={marginPct}
                      onChange={(e) => setMarginPct(e.target.value)}
                      className="w-full pl-3 pr-7 py-2 bg-[#0a0a0a]/60 border border-[rgba(90,84,189,0.15)] rounded-lg text-sm text-white focus:outline-none focus:border-[#5A54BD]/40 transition-colors"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666] text-sm">%</span>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] uppercase tracking-wider text-[#555] mb-1 block">Sell CPA</label>
                  <div className="py-2 px-3 bg-[#5A54BD]/8 border border-[#5A54BD]/15 rounded-lg text-sm text-[#8B86E0] font-semibold">
                    ${sellCpa}
                  </div>
                </div>
              </div>
            </div>

            {/* Required Columns */}
            <div className="mt-4 glass rounded-xl p-5">
              <h3 className="text-xs font-semibold text-[#5A54BD]/60 uppercase tracking-wider mb-3">Required Columns</h3>
              <div className="grid grid-cols-2 gap-2">
                {REQUIRED_COLUMNS.map((col) => (
                  <div key={col} className="flex items-center gap-2 text-sm text-[#888]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#5A54BD]" />
                    {col}
                  </div>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-4 flex items-start gap-3 bg-[#C0392B]/10 border border-[#C0392B]/20 rounded-xl p-4 text-sm text-[#C0392B]">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            {/* Upload Button */}
            <button
              onClick={handleUpload}
              disabled={!file}
              className={`mt-6 w-full py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                file
                  ? 'bg-gradient-to-r from-[#5A54BD] to-[#6BB3CD] text-white hover:shadow-lg hover:shadow-[#5A54BD]/20 active:scale-[0.99]'
                  : 'bg-[#161B2E] text-[#444] cursor-not-allowed border border-[rgba(90,84,189,0.08)]'
              }`}
            >
              Analyse Campaign Data
            </button>
          </>
        )}

        {/* Processing Steps */}
        {uploading && (
          <div className="glass-strong rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-white mb-5">Processing your data...</h3>
            <div className="space-y-3">
              {STEPS.map((step, i) => {
                const isDone = i < currentStep || (i === STEPS.length - 1 && currentStep === STEPS.length - 1);
                const isActive = i === currentStep && i < STEPS.length - 1;
                const isPending = i > currentStep;

                return (
                  <div key={i} className={`flex items-center gap-3 text-sm transition-all duration-300 ${isPending ? 'opacity-25' : ''}`}>
                    {isDone ? (
                      <CheckCircle2 size={16} className="text-[#1E8449] shrink-0 step-done" />
                    ) : isActive ? (
                      <Loader2 size={16} className="text-[#5A54BD] animate-spin shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-[#2a2a3a] shrink-0" />
                    )}
                    <span className={isDone ? 'text-[#1E8449]' : isActive ? 'text-white' : 'text-[#444]'}>{step}</span>
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="mt-4 flex items-start gap-3 bg-[#C0392B]/10 border border-[#C0392B]/20 rounded-xl p-4 text-sm text-[#C0392B]">
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
