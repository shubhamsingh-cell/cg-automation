import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History,
  ArrowLeft,
  FileSpreadsheet,
  RefreshCw,
  PlusCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { fetchUploadHistory } from '../utils/api';
import { useAnalysis } from '../context/AnalysisContext';

export default function UploadHistory() {
  const navigate = useNavigate();
  const { sessionId } = useAnalysis();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const result = await fetchUploadHistory(sessionId);
        if (!cancelled) {
          setHistory(result.uploads || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || err.message || 'Failed to load history');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <p className="text-[#666] text-sm">No active session. Upload data first.</p>
        <button
          onClick={() => navigate('/upload')}
          className="mt-4 px-4 py-2 rounded-lg bg-[#5A54BD]/15 text-[#5A54BD] text-sm font-semibold hover:bg-[#5A54BD]/25 transition-colors"
        >
          Go to Upload
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/upload')}
          className="p-2 rounded-lg hover:bg-white/5 text-[#666] hover:text-white transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#e4e4e7] flex items-center gap-2">
            <History size={20} className="text-[#5A54BD]" />
            Upload History
          </h1>
          <p className="text-xs text-[#666] mt-0.5">
            Session: {sessionId.slice(0, 8)}...
          </p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="text-[#5A54BD] animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 bg-[#C0392B]/8 border border-[#C0392B]/15 rounded-xl p-4 text-sm text-[#E74C3C]" role="alert">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* History Table */}
      {!loading && !error && history.length === 0 && (
        <div className="text-center py-12 text-[#555] text-sm">
          No upload history found for this session.
        </div>
      )}

      {!loading && !error && history.length > 0 && (
        <div className="space-y-3">
          {history.map((upload, idx) => (
            <div
              key={upload.upload_id || idx}
              className="rounded-xl bg-[#111118] border border-[rgba(255,255,255,0.06)] p-4 hover:border-[rgba(255,255,255,0.1)] transition-colors"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    upload.upload_type === 'daily'
                      ? 'bg-[#1E8449]/10'
                      : 'bg-[#5A54BD]/10'
                  }`}>
                    {upload.upload_type === 'daily'
                      ? <PlusCircle size={16} className="text-[#1E8449]" />
                      : <RefreshCw size={14} className="text-[#5A54BD]" />
                    }
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-white font-medium truncate">
                        {upload.filename || 'Unknown file'}
                      </p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        upload.upload_type === 'daily'
                          ? 'bg-[#1E8449]/15 text-[#1E8449]'
                          : 'bg-[#5A54BD]/15 text-[#5A54BD]'
                      }`}>
                        {upload.upload_type === 'daily' ? 'DAILY' : 'FRESH'}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#555] mt-0.5">
                      {upload.created_at ? new Date(upload.created_at).toLocaleString() : ''}
                      {upload.date_range_from && upload.date_range_to
                        ? ` | Data: ${upload.date_range_from} to ${upload.date_range_to}`
                        : ''}
                      {upload.row_count ? ` | ${upload.row_count.toLocaleString()} rows` : ''}
                    </p>
                  </div>
                </div>

                {/* Change stats */}
                {upload.upload_type === 'daily' && (
                  <div className="flex items-center gap-3 shrink-0 text-[10px]">
                    {upload.posts_updated > 0 && (
                      <span className="text-[#6BB3CD]">{upload.posts_updated} updated</span>
                    )}
                    {upload.new_posts > 0 && (
                      <span className="text-[#1E8449]">{upload.new_posts} new</span>
                    )}
                    {upload.newly_repost > 0 && (
                      <span className="text-[#E74C3C]">{upload.newly_repost} repost</span>
                    )}
                    {upload.posts_ended > 0 && (
                      <span className="text-[#888]">{upload.posts_ended} ended</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
