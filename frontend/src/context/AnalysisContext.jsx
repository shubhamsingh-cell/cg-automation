import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { fetchLatestUpload, clearUploadData, deleteSession } from '../utils/api';

const AnalysisContext = createContext(null);

/** Convert PascalCase/Mixed keys to snake_case for consistent frontend access. */
function normalizeKey(key) {
  if (/^[a-z0-9_]+$/.test(key)) return key;
  if (/^[A-Z0-9_]+$/.test(key)) return key.toLowerCase();
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/__+/g, '_');
}

function normalizeObj(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(normalizeObj);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const nk = normalizeKey(k);
    out[nk] = normalizeObj(v);
    if (nk !== k) out[k] = out[nk];
  }
  return out;
}

export function AnalysisProvider({ children }) {
  const [data, setData] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [sessionId, setSessionId] = useState(() => {
    try { return localStorage.getItem('cg_session_id') || null; }
    catch { return null; }
  });
  const [insightsCache, setInsightsCache] = useState({});
  const [uploadMeta, setUploadMeta] = useState(null);
  const [changeSummary, setChangeSummary] = useState(null);
  const [restoring, setRestoring] = useState(true);

  const loadAnalysis = useCallback((analysisData, meta) => {
    const normalized = normalizeObj(analysisData);
    setData(normalized);
    setJobId(analysisData.job_id);
    setInsightsCache({});
    if (meta) setUploadMeta(meta);

    // Save session_id to localStorage if present
    if (analysisData.session_id) {
      setSessionId(analysisData.session_id);
      try { localStorage.setItem('cg_session_id', analysisData.session_id); }
      catch { /* ignore */ }
    }

    // Store change summary if present (from daily upload)
    if (analysisData.change_summary) {
      setChangeSummary(analysisData.change_summary);
    } else {
      setChangeSummary(null);
    }
  }, []);

  const cacheInsight = useCallback((key, insight) => {
    setInsightsCache((prev) => ({ ...prev, [key]: insight }));
  }, []);

  const dismissChangeSummary = useCallback(() => {
    setChangeSummary(null);
  }, []);

  const clearData = useCallback(async () => {
    const sid = sessionId;
    setData(null);
    setJobId(null);
    setSessionId(null);
    setInsightsCache({});
    setUploadMeta(null);
    setChangeSummary(null);
    try { localStorage.removeItem('cg_session_id'); } catch { /* ignore */ }

    try {
      // Try to delete session data if we have a session_id
      if (sid) {
        await deleteSession(sid);
      } else {
        await clearUploadData();
      }
    } catch (err) {
      console.warn('Failed to clear server data:', err);
    }
  }, [sessionId]);

  // On mount: check Supabase for persisted upload data
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const result = await fetchLatestUpload();
        if (!cancelled && result && result.found && result.analysis_data) {
          const normalized = normalizeObj(result.analysis_data);
          setData(normalized);
          setJobId(result.job_id || result.analysis_data.job_id);
          setUploadMeta({
            filename: result.filename || '',
            created_at: result.created_at || '',
            client_name: result.client_name || '',
          });
          // Restore session_id from analysis data or localStorage
          const sid = result.analysis_data.session_id;
          if (sid) {
            setSessionId(sid);
            try { localStorage.setItem('cg_session_id', sid); }
            catch { /* ignore */ }
          }
        }
      } catch (err) {
        console.warn('Failed to restore persisted upload:', err);
      } finally {
        if (!cancelled) setRestoring(false);
      }
    }
    restore();
    return () => { cancelled = true; };
  }, []);

  return (
    <AnalysisContext.Provider value={{
      data, jobId, sessionId, insightsCache, uploadMeta, restoring, changeSummary,
      loadAnalysis, cacheInsight, clearData, dismissChangeSummary,
    }}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis() {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error('useAnalysis must be used within AnalysisProvider');
  return ctx;
}
