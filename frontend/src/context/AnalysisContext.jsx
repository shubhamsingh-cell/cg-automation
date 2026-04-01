import { createContext, useContext, useState, useCallback } from 'react';

const AnalysisContext = createContext(null);

/** Convert PascalCase/Mixed keys to snake_case for consistent frontend access */
function normalizeKey(key) {
  return key
    .replace(/([A-Z])/g, '_$1')
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
    // Also keep original key for backward compat
    if (nk !== k) out[k] = out[nk];
  }
  return out;
}

export function AnalysisProvider({ children }) {
  const [data, setData] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [insightsCache, setInsightsCache] = useState({});

  const loadAnalysis = useCallback((analysisData) => {
    const normalized = normalizeObj(analysisData);
    setData(normalized);
    setJobId(analysisData.job_id);
    setInsightsCache({});
  }, []);

  const cacheInsight = useCallback((key, insight) => {
    setInsightsCache((prev) => ({ ...prev, [key]: insight }));
  }, []);

  const clearData = useCallback(() => {
    setData(null);
    setJobId(null);
    setInsightsCache({});
  }, []);

  return (
    <AnalysisContext.Provider value={{ data, jobId, insightsCache, loadAnalysis, cacheInsight, clearData }}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis() {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error('useAnalysis must be used within AnalysisProvider');
  return ctx;
}
