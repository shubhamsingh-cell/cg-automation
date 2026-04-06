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
  RefreshCw,
  PlusCircle,
  History,
  ArrowRight,
} from 'lucide-react';
import { uploadFresh, uploadDaily, uploadFile } from '../utils/api';
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

const MERGE_STEPS = [
  'Reading uploaded file...',
  'Checking for existing posts (dedup)...',
  'Matching new rows to existing post runs...',
  'Inserting new daily data...',
  'Rebuilding full analysis from accumulated data...',
  'Recalculating decisions and posting plan...',
  'Computing change summary...',
  'Done!',
];

export default function Upload() {
  const navigate = useNavigate();
  const {
    data: existingData,
    loadAnalysis,
    clearData,
    uploadMeta,
    sessionId,
    changeSummary,
    dismissChangeSummary,
  } = useAnalysis();
  const [clearing, setClearing] = useState(false);
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState(null);
  const [currentProcessingStep, setCurrentProcessingStep] = useState(-1);
  const [error, setError] = useState(null);

  // Form inputs (restored -- Ayushi feedback)
  const [sellCpa, setSellCpa] = useState('1.20');
  const [clientName, setClientName] = useState('');
  const [monthlyBudget, setMonthlyBudget] = useState('5000');

  const hasExistingSession = !!sessionId && !!existingData;

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

  function getCampaignContext() {
    return {
      client_name: clientName,
      job_category: '',
      competitors: '',
      target_geography: 'us_national',
      monthly_budget: parseFloat(monthlyBudget) || 5000,
    };
  }

  async function handleUploadFresh() {
    if (!file) return;
    setUploading(true);
    setUploadMode('fresh');
    setError(null);
    setCurrentProcessingStep(0);

    const steps = PROCESSING_STEPS;
    const stepInterval = setInterval(() => {
      setCurrentProcessingStep((prev) => prev < steps.length - 2 ? prev + 1 : prev);
    }, 1500);

    try {
      const cpaValue = parseFloat(sellCpa) || 1.2;
      const data = await uploadFresh(file, cpaValue, getCampaignContext());
      clearInterval(stepInterval);
      setCurrentProcessingStep(steps.length - 1);
      loadAnalysis(data, {
        filename: file.name, created_at: new Date().toISOString(), client_name: clientName,
      });
      posthog.capture('file_uploaded_fresh', {
        rows: data?.daily_action_plan?.length || 0,
        session_id: data?.session_id,
        sell_cpa: cpaValue,
      });
      setTimeout(() => navigate('/action-plan'), 800);
    } catch (err) {
      clearInterval(stepInterval);
      setCurrentProcessingStep(-1);
      setError(err.response?.data?.detail || err.message || 'Upload failed.');
      setUploading(false);
    }
  }

  async function handleUploadDaily() {
    if (!file || !sessionId) return;
    setUploading(true);
    setUploadMode('daily');
    setError(null);
    setCurrentProcessingStep(0);

    const steps = MERGE_STEPS;
    const stepInterval = setInterval(() => {
      setCurrentProcessingStep((prev) => prev < steps.length - 2 ? prev + 1 : prev);
    }, 2000);

    try {
      const cpaValue = parseFloat(sellCpa) || 1.2;
      const data = await uploadDaily(file, sessionId, cpaValue, clientName);
      clearInterval(stepInterval);
      setCurrentProcessingStep(steps.length - 1);
      loadAnalysis(data, {
        filename: file.name, created_at: new Date().toISOString(), client_name: clientName,
      });
      posthog.capture('file_uploaded_daily', {
        rows_inserted: data?.merge_stats?.new_rows_inserted || 0,
        posts_updated: data?.merge_stats?.posts_updated || 0,
        session_id: data?.session_id,
      });
      setTimeout(() => navigate('/action-plan'), 800);
    } catch (err) {
      clearInterval(stepInterval);
      setCurrentProcessingStep(-1);
      setError(err.response?.data?.detail || err.message || 'Daily upload failed.');
      setUploading(false);
    }
  }

  async function handleSampleData() {
    setUploading(true);
    setUploadMode('fresh');
    setError(null);
    setCurrentProcessingStep(0);
    const stepInterval = setInterval(() => {
      setCurrentProcessingStep((prev) => prev < PROCESSING_STEPS.length - 2 ? prev + 1 : prev);
    }, 1500);
    try {
      const data = await uploadFile(null, 'demo', 1.2, {
        client_name: 'Demo Client', job_category: 'gig_work', competitors: '',
        target_geography: 'us_national', monthly_budget: 5000,
      });
      clearInterval(stepInterval);
      setCurrentProcessingStep(PROCESSING_STEPS.length - 1);
      loadAnalysis(data, {
        filename: 'sample_data.xlsx', created_at: new Date().toISOString(), client_name: 'Demo Client',
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

  const activeSteps = uploadMode === 'daily' ? MERGE_STEPS : PROCESSING_STEPS;

  // ============================================================
  // RENDER -- Matching SlotOps visual quality exactly
  // ============================================================
  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full" style={{ minHeight: '60vh' }}>
      <div className="w-full max-w-[520px] mx-auto text-center">

        {/* ---- Change Summary Banner ---- */}
        {changeSummary && (
          <div className="w-full mb-6 rounded-2xl text-left" style={{ background: 'rgba(90,84,189,0.08)', border: '1px solid rgba(90,84,189,0.2)', padding: '1.25rem' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <RefreshCw size={14} style={{ color: '#5A54BD' }} />
                Daily Upload Complete
              </h3>
              <button onClick={dismissChangeSummary} className="text-[#71717a] hover:text-white transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { val: changeSummary.posts_updated || 0, label: 'Posts Updated', color: '#0a66c2' },
                { val: changeSummary.new_posts || 0, label: 'New Posts', color: '#22c55e' },
                { val: changeSummary.newly_repost || 0, label: 'Newly REPOST', color: '#ef4444' },
                { val: changeSummary.posts_ended || 0, label: 'Posts Ended', color: '#71717a' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '0.75rem', textAlign: 'center' }}>
                  <p className="text-xl font-bold" style={{ color: s.color }}>{s.val}</p>
                  <p style={{ fontSize: '10px', color: '#71717a', marginTop: '2px' }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- Persisted Data Banner ---- */}
        {existingData && uploadMeta && (
          <div className="w-full mb-6 text-left" style={{ borderRadius: '16px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', padding: '1rem' }}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Database size={18} style={{ color: '#22c55e', flexShrink: 0 }} />
                <div className="min-w-0">
                  <p style={{ fontSize: '0.875rem', color: 'white', fontWeight: 500 }} className="truncate">
                    Data loaded: {uploadMeta.filename || 'Previous upload'}
                    {uploadMeta.client_name ? ` (${uploadMeta.client_name})` : ''}
                  </p>
                  <p style={{ fontSize: '10px', color: 'rgba(34,197,94,0.6)', marginTop: '2px' }}>
                    {sessionId ? `Session: ${sessionId.slice(0, 8)}...` : ''}
                    {uploadMeta.created_at ? ` | ${new Date(uploadMeta.created_at).toLocaleString()}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                <button
                  onClick={() => navigate('/dashboard')}
                  style={{ padding: '6px 12px', borderRadius: '8px', background: 'rgba(34,197,94,0.12)', color: '#22c55e', fontSize: '12px', fontWeight: 600 }}
                >
                  Dashboard
                </button>
                <button
                  onClick={async () => { setClearing(true); await clearData(); setClearing(false); }}
                  disabled={clearing}
                  style={{ padding: '6px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: '12px', fontWeight: 600 }}
                  className="flex items-center gap-1.5"
                >
                  {clearing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---- UPLOAD CARD ---- */}
        {!uploading ? (
          <>
            {/* Title -- matches SlotOps: 1.75rem, 700 weight, italic */}
            <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Upload Your Campaign Data
            </h2>

            {/* Subtitle -- matches SlotOps: #71717a, 0.9375rem, 1.6 line-height */}
            <p style={{ color: '#71717a', marginBottom: '1.5rem', fontSize: '0.9375rem', lineHeight: 1.6 }}>
              Drop an Excel or CSV file to generate location-specific posting recommendations with daily action plans and performance predictions.
            </p>

            {/* Status line -- matches SlotOps green */}
            <div style={{ fontSize: '0.8125rem', minHeight: '1.5em', marginBottom: '1rem' }}>
              <span style={{ color: '#22c55e' }}>
                {hasExistingSession
                  ? 'Ready -- active session, add daily data or start fresh'
                  : 'Ready -- drop your file or use sample data'}
              </span>
            </div>

            {/* Drop zone -- matches SlotOps exactly */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => !file && fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); !file && fileInputRef.current?.click(); } }}
              aria-label={file ? `Selected file: ${file.name}` : 'Drop your file here or click to browse'}
              style={{
                border: `2px dashed ${dragOver ? '#0a66c2' : file ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: '16px',
                padding: '3.5rem 2rem',
                cursor: 'pointer',
                background: dragOver ? 'rgba(10,102,194,0.05)' : file ? 'rgba(34,197,94,0.03)' : 'rgba(17,17,17,0.8)',
                transition: 'border-color 0.2s, background 0.2s',
                marginBottom: '1rem',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => handleFile(e.target.files[0])}
                style={{ display: 'none' }}
                aria-label="Choose file to upload"
              />
              {file ? (
                <div className="flex flex-col items-center gap-3">
                  <CheckCircle2 size={36} style={{ color: '#22c55e' }} />
                  <div className="inline-flex items-center gap-3" style={{ padding: '0.75rem 1.25rem', borderRadius: '12px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                    <FileSpreadsheet size={18} style={{ color: '#22c55e', flexShrink: 0 }} />
                    <div className="text-left">
                      <p style={{ color: 'white', fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.2 }}>{file.name}</p>
                      <p style={{ color: 'rgba(34,197,94,0.6)', fontSize: '0.75rem', marginTop: '2px' }}>{formatFileSize(file.size)}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      style={{ marginLeft: '8px', padding: '4px', borderRadius: '8px', color: '#71717a' }}
                      className="hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Spreadsheet emoji icon -- matches SlotOps 3rem */}
                  <span style={{ fontSize: '3rem', marginBottom: '1rem', display: 'block' }} aria-hidden="true">&#x1F4CA;</span>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                    Drop .xlsx or .csv here
                  </h3>
                  <p style={{ fontSize: '0.8125rem', color: '#71717a' }}>
                    Cumulative Impressions, Clicks, Applies per Post ID per Date
                  </p>
                </>
              )}
            </div>

            {/* ---- CPA + Budget inputs (restored) ---- */}
            {file && (
              <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Sell CPA ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={sellCpa}
                      onChange={(e) => setSellCpa(e.target.value)}
                      style={{
                        width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px',
                        background: 'rgba(17,17,17,0.8)', border: '1px solid rgba(255,255,255,0.08)',
                        color: 'white', fontSize: '0.875rem', outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Client Name</label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Optional"
                      style={{
                        width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px',
                        background: 'rgba(17,17,17,0.8)', border: '1px solid rgba(255,255,255,0.08)',
                        color: 'white', fontSize: '0.875rem', outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Monthly Budget ($)</label>
                    <input
                      type="number"
                      step="100"
                      min="0"
                      value={monthlyBudget}
                      onChange={(e) => setMonthlyBudget(e.target.value)}
                      style={{
                        width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px',
                        background: 'rgba(17,17,17,0.8)', border: '1px solid rgba(255,255,255,0.08)',
                        color: 'white', fontSize: '0.875rem', outline: 'none',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ---- Upload buttons (shown when file selected) ---- */}
            {file && (
              <div className="flex flex-col sm:flex-row gap-3" style={{ marginBottom: '1rem' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); handleUploadFresh(); }}
                  style={{
                    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    gap: '0.5rem', background: '#0a66c2', color: 'white', border: 'none',
                    borderRadius: '8px', padding: '0.75rem 1.5rem', fontSize: '0.9375rem',
                    fontWeight: 600, cursor: 'pointer', minHeight: '44px',
                    transition: 'opacity 0.15s, transform 0.15s',
                  }}
                  className="hover:opacity-90 active:translate-y-0"
                  onMouseDown={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                  onMouseUp={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                >
                  <RefreshCw size={16} />
                  {hasExistingSession ? 'Start Fresh' : 'Analyse Campaign Data'}
                </button>

                {hasExistingSession && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleUploadDaily(); }}
                    style={{
                      flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      gap: '0.5rem', background: '#22c55e', color: 'white', border: 'none',
                      borderRadius: '8px', padding: '0.75rem 1.5rem', fontSize: '0.9375rem',
                      fontWeight: 600, cursor: 'pointer', minHeight: '44px',
                      transition: 'opacity 0.15s, transform 0.15s',
                    }}
                    className="hover:opacity-90"
                  >
                    <PlusCircle size={16} />
                    Add Today's Data
                  </button>
                )}
              </div>
            )}

            {/* Button explanations */}
            {file && hasExistingSession && (
              <p style={{ fontSize: '0.75rem', color: '#71717a', marginBottom: '0.5rem' }}>
                <strong style={{ color: '#a1a1aa' }}>Start Fresh</strong> = new campaign period &nbsp;|&nbsp; <strong style={{ color: '#a1a1aa' }}>Add Today's Data</strong> = merge with existing
              </p>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 text-left" role="alert" style={{ marginTop: '1rem', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: '12px', padding: '1rem', fontSize: '0.875rem', color: '#ef4444' }}>
                <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
                {error}
              </div>
            )}

            {/* OR divider -- matches SlotOps: 0.75rem, uppercase, letter-spacing */}
            <div style={{ fontSize: '0.75rem', color: '#71717a', margin: '1rem 0', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              or
            </div>

            {/* Demo button -- matches SlotOps: #0a66c2 background, 0.9375rem, 600 weight */}
            <button
              onClick={handleSampleData}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                background: '#0a66c2', color: 'white', border: 'none',
                borderRadius: '8px', padding: '0.75rem 1.5rem', fontSize: '0.9375rem',
                fontWeight: 600, cursor: 'pointer', minHeight: '44px',
                transition: 'opacity 0.15s, transform 0.15s',
              }}
              className="hover:opacity-90"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Use Demo Data
            </button>

            {/* Template download -- matches SlotOps with divider line */}
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <a
                href="/api/template"
                download
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                  color: '#6BB3CD', textDecoration: 'none', fontSize: '0.8125rem',
                  fontWeight: 500, padding: '0.5rem 0', transition: 'color 0.2s',
                }}
              >
                <Download size={14} />
                Download Template (.xlsx) -- fill in your data, then upload here
              </a>
            </div>

            {/* Upload History link */}
            {hasExistingSession && (
              <div style={{ marginTop: '0.75rem' }}>
                <button
                  onClick={() => navigate('/upload-history')}
                  style={{ fontSize: '0.8125rem', color: 'rgba(90,84,189,0.7)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.375rem', transition: 'color 0.2s' }}
                  className="hover:text-[#5A54BD]"
                >
                  <History size={13} />
                  View Upload History
                  <ArrowRight size={11} />
                </button>
              </div>
            )}
          </>
        ) : (
          /* ---- Processing state ---- */
          <>
            <div className="flex items-center justify-center gap-3" style={{ marginBottom: '1.25rem' }}>
              <Loader2 size={20} className="animate-spin" style={{ color: '#0a66c2' }} />
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'white' }}>
                {uploadMode === 'daily' ? 'Merging with existing data' : 'Processing your data'}
              </h3>
            </div>
            {/* Progress bar */}
            <div style={{ height: '4px', borderRadius: '4px', background: '#1a1a2a', overflow: 'hidden', marginBottom: '2rem', maxWidth: '400px', margin: '0 auto 2rem' }}>
              <div className="processing-bar" style={{ height: '100%', borderRadius: '4px', background: 'linear-gradient(90deg, #0a66c2, #3b82f6, #0a66c2)', backgroundSize: '200% 100%' }} />
            </div>
            <div className="inline-block text-left">
              <div className="relative" style={{ marginLeft: '2px' }}>
                <div style={{ position: 'absolute', left: '9px', top: '8px', bottom: '8px', width: '1px', background: '#1a1a2e' }} aria-hidden="true" />
                <div className="space-y-1">
                  {activeSteps.map((label, i) => {
                    const isDone = i < currentProcessingStep || (i === activeSteps.length - 1 && currentProcessingStep === activeSteps.length - 1);
                    const isActive = i === currentProcessingStep && i < activeSteps.length - 1;
                    const isPending = i > currentProcessingStep;
                    return (
                      <div key={i} className="flex items-center gap-4" style={{ padding: '0.5rem 0', opacity: isPending ? 0.2 : 1, transition: 'opacity 0.5s' }}>
                        <div style={{ position: 'relative', zIndex: 10, flexShrink: 0 }}>
                          {isDone ? (
                            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <CheckCircle2 size={14} style={{ color: '#22c55e' }} />
                            </div>
                          ) : isActive ? (
                            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(10,102,194,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Loader2 size={12} className="animate-spin" style={{ color: '#0a66c2' }} />
                            </div>
                          ) : (
                            <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '1px solid #2a2a3a', background: '#0a0a0a' }} />
                          )}
                        </div>
                        <span style={{ fontSize: '0.875rem', color: isDone ? '#22c55e' : isActive ? 'white' : '#333', fontWeight: isActive ? 500 : 400, transition: 'color 0.3s' }}>
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-3 text-left" role="alert" style={{ marginTop: '1.5rem', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: '12px', padding: '1rem', fontSize: '0.875rem', color: '#ef4444', maxWidth: '400px', margin: '1.5rem auto 0' }}>
                <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
