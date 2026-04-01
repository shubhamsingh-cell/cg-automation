import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import { Upload as UploadIcon, FileSpreadsheet, CheckCircle2, Loader2, AlertCircle, X } from 'lucide-react';
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

    // Simulate step progression while waiting for API
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < STEPS.length - 2) return prev + 1;
        return prev;
      });
    }, 1500);

    try {
      const data = await uploadFile(file);
      clearInterval(stepInterval);
      setCurrentStep(STEPS.length - 1);
      loadAnalysis(data);

      const sessionId = `cg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      posthog.identify(sessionId);
      posthog.capture('file_uploaded', {
        rows: data?.daily_action_plan?.length || 0,
        locations: [...new Set((data?.daily_action_plan || []).map((r) => r.location))].length,
        runs: data?.all_runs?.length || 0,
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
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white tracking-tight">CG Automation</h1>
          <p className="text-[#888] mt-2 text-sm">
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
              className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all ${
                dragOver
                  ? 'border-[#2E74B5] bg-[#2E74B5]/5'
                  : file
                  ? 'border-[#1E8449]/50 bg-[#1E8449]/5'
                  : 'border-[#2a2a2a] bg-[#111] hover:border-[#444] hover:bg-[#141414]'
              }`}
            >
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => handleFile(e.target.files[0])}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              {file ? (
                <div className="flex flex-col items-center gap-3">
                  <FileSpreadsheet size={40} className="text-[#1E8449]" />
                  <div>
                    <p className="text-white font-medium">{file.name}</p>
                    <p className="text-[#666] text-xs mt-1">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="text-xs text-[#666] hover:text-white flex items-center gap-1 mt-1"
                  >
                    <X size={12} /> Remove
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <UploadIcon size={40} className="text-[#444]" />
                  <div>
                    <p className="text-white font-medium">Drop your Excel file here</p>
                    <p className="text-[#666] text-xs mt-1">or click to browse</p>
                  </div>
                </div>
              )}
            </div>

            {/* Required Columns */}
            <div className="mt-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
              <h3 className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-3">Required Columns</h3>
              <div className="grid grid-cols-2 gap-2">
                {REQUIRED_COLUMNS.map((col) => (
                  <div key={col} className="flex items-center gap-2 text-sm text-[#999]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#2E74B5]" />
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
              className={`mt-6 w-full py-3 rounded-xl text-sm font-semibold transition-all ${
                file
                  ? 'bg-[#2E74B5] text-white hover:bg-[#3584c5] active:scale-[0.99]'
                  : 'bg-[#1a1a1a] text-[#555] cursor-not-allowed'
              }`}
            >
              Analyse Campaign Data
            </button>
          </>
        )}

        {/* Processing Steps */}
        {uploading && (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
            <h3 className="text-sm font-semibold text-white mb-5">Processing your data...</h3>
            <div className="space-y-3">
              {STEPS.map((step, i) => {
                const isDone = i < currentStep || (i === STEPS.length - 1 && currentStep === STEPS.length - 1);
                const isActive = i === currentStep && i < STEPS.length - 1;
                const isPending = i > currentStep;

                return (
                  <div key={i} className={`flex items-center gap-3 text-sm transition-opacity ${isPending ? 'opacity-30' : ''}`}>
                    {isDone ? (
                      <CheckCircle2 size={16} className="text-[#1E8449] shrink-0" />
                    ) : isActive ? (
                      <Loader2 size={16} className="text-[#2E74B5] animate-spin shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-[#333] shrink-0" />
                    )}
                    <span className={isDone ? 'text-[#1E8449]' : isActive ? 'text-white' : 'text-[#555]'}>{step}</span>
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
