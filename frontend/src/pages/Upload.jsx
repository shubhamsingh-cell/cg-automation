import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import {
  Upload as UploadIcon,
  X,
  CheckCircle2,
  Loader2,
  FileSpreadsheet,
  AlertCircle,
  Trash2,
  Database,
  Download,
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

export default function Upload() {
  const navigate = useNavigate();
  const { data: existingData, loadAnalysis, clearData, uploadMeta } = useAnalysis();
  const [clearing, setClearing] = useState(false);
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [currentProcessingStep, setCurrentProcessingStep] = useState(-1);
  const [error, setError] = useState(null);

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

  // --- Upload / analyse (uses sensible defaults) ---
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
      const cpaValue = 1.2;
      const campaignContext = {
        client_name: '',
        job_category: '',
        competitors: '',
        target_geography: 'us_national',
        monthly_budget: 5000,
      };
      const data = await uploadFile(file, undefined, cpaValue, campaignContext);
      clearInterval(stepInterval);
      setCurrentProcessingStep(PROCESSING_STEPS.length - 1);
      loadAnalysis(data, {
        filename: file.name,
        created_at: new Date().toISOString(),
        client_name: '',
      });

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

  // --- Load sample data ---
  async function handleSampleData() {
    // Trigger the same upload flow but with demo mode
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
      const cpaValue = 1.2;
      const campaignContext = {
        client_name: 'Demo Client',
        job_category: 'gig_work',
        competitors: '',
        target_geography: 'us_national',
        monthly_budget: 5000,
      };
      const data = await uploadFile(null, 'demo', cpaValue, campaignContext);
      clearInterval(stepInterval);
      setCurrentProcessingStep(PROCESSING_STEPS.length - 1);
      loadAnalysis(data, {
        filename: 'sample_data.xlsx',
        created_at: new Date().toISOString(),
        client_name: 'Demo Client',
      });

      posthog.capture('demo_data_loaded');
      setTimeout(() => navigate('/action-plan'), 800);
    } catch (err) {
      clearInterval(stepInterval);
      setCurrentProcessingStep(-1);
      setError(err.response?.data?.detail || err.message || 'Failed to load sample data.');
      setUploading(false);
    }
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="flex-1 flex flex-col items-center justify-center max-w-3xl mx-auto w-full px-6 py-12">

      {/* ---- Persisted Data Banner ---- */}
      {existingData && uploadMeta && (
        <div className="w-full mb-6 rounded-xl bg-[#1E8449]/8 border border-[#1E8449]/20 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Database size={18} className="text-[#1E8449] shrink-0" />
            <div className="min-w-0">
              <p className="text-sm text-white font-medium truncate">
                Data loaded: {uploadMeta.filename || 'Previous upload'}
                {uploadMeta.client_name ? ` (${uploadMeta.client_name})` : ''}
              </p>
              <p className="text-[10px] text-[#1E8449]/70 mt-0.5">
                Last uploaded: {uploadMeta.created_at
                  ? new Date(uploadMeta.created_at).toLocaleString()
                  : 'Unknown'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-3 py-1.5 rounded-lg bg-[#1E8449]/15 text-[#1E8449] text-xs font-semibold hover:bg-[#1E8449]/25 transition-colors"
            >
              View Dashboard
            </button>
            <button
              onClick={async () => {
                setClearing(true);
                await clearData();
                setClearing(false);
              }}
              disabled={clearing}
              className="px-3 py-1.5 rounded-lg bg-[#C0392B]/10 text-[#E74C3C] text-xs font-semibold hover:bg-[#C0392B]/20 transition-colors flex items-center gap-1.5"
              title="Clear persisted data"
            >
              {clearing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Clear
            </button>
          </div>
        </div>
      )}

      {/* ---- Upload Card ---- */}
      {!uploading ? (
        <div className="w-full page-enter">
          {/* Title */}
          <h1 className="text-2xl font-bold text-[#e4e4e7] tracking-tight">
            Upload Your Campaign Data
          </h1>
          <p className="text-sm text-[#888] mt-2 leading-relaxed max-w-xl">
            Drop an Excel or CSV file to generate location-specific posting recommendations with daily action plans and performance predictions.
          </p>

          {/* Status line */}
          <p className="text-xs text-[#1E8449] mt-4 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1E8449] inline-block" />
            Ready -- drop your file or use sample data
          </p>

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
            className={`mt-6 relative rounded-xl text-center transition-all duration-300 cursor-pointer border-2 border-dashed ${
              dragOver
                ? 'border-[#6BB3CD] bg-[#6BB3CD]/5 scale-[1.01]'
                : file
                ? 'border-[#1E8449]/40 bg-[#1E8449]/5'
                : 'border-[rgba(255,255,255,0.08)] bg-[#111118] hover:border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.03)]'
            } p-10`}
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
              <div className="flex flex-col items-center gap-3">
                <CheckCircle2 size={32} className="text-[#1E8449]" />
                <div className="inline-flex items-center gap-3 px-4 py-2 rounded-lg bg-[#1E8449]/8 border border-[#1E8449]/20">
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
                <button
                  onClick={(e) => { e.stopPropagation(); handleUpload(); }}
                  className="mt-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2 text-white hover:shadow-xl active:scale-[0.99]"
                  style={{ background: 'linear-gradient(135deg, #6BB3CD, #5A54BD)' }}
                >
                  Analyse Campaign Data
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-[rgba(255,255,255,0.04)] flex items-center justify-center">
                  <UploadIcon size={28} className="text-[#666]" />
                </div>
                <div>
                  <p className="text-[#e4e4e7] font-semibold">Drop your file here</p>
                  <p className="text-[#666] text-sm mt-1">or click to browse</p>
                </div>
                <p className="text-[#444] text-xs">Accepts .xlsx, .xls, and .csv files</p>
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

          {/* OR divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-[rgba(255,255,255,0.06)]" />
            <span className="text-xs text-[#555] font-medium">OR</span>
            <div className="flex-1 h-px bg-[rgba(255,255,255,0.06)]" />
          </div>

          {/* Use Sample Data button */}
          <button
            onClick={handleSampleData}
            className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2 bg-[#6BB3CD]/10 border border-[#6BB3CD]/20 text-[#6BB3CD] hover:bg-[#6BB3CD]/15 hover:border-[#6BB3CD]/30"
          >
            Use Sample Data
          </button>

          {/* Template download link */}
          <div className="mt-4 text-center">
            <a
              href="/api/template"
              className="text-xs text-[#555] hover:text-[#888] transition-colors inline-flex items-center gap-1.5"
              download
            >
              <Download size={12} />
              Download Template (.xlsx)
            </a>
          </div>
        </div>
      ) : (
        /* ---- Processing state ---- */
        <div className="w-full page-enter">
          <div className="flex items-center gap-3 mb-4">
            <Loader2 size={18} className="text-[#6BB3CD] animate-spin" />
            <h3 className="text-base font-semibold text-white">Processing your data</h3>
          </div>
          {/* Pulsing progress bar */}
          <div className="h-1 rounded-full bg-[#1a1a2a] overflow-hidden mb-6">
            <div className="h-full rounded-full processing-bar" style={{ background: 'linear-gradient(90deg, #6BB3CD, #8ecfe0, #6BB3CD)', backgroundSize: '200% 100%' }} />
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
  );
}
