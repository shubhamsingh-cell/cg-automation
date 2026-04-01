import { createContext, useContext, useState, useCallback } from 'react';

const AnalysisContext = createContext(null);

/** Convert PascalCase/Mixed keys to snake_case for consistent frontend access.
 *  Handles: camelCase, PascalCase, ALL_CAPS, mixed (e.g. "TotalNR" -> "total_nr").
 *  Does NOT mangle already-snake_case keys or ALL-CAPS values used as labels. */
function normalizeKey(key) {
  // If already snake_case or lowercase, return as-is
  if (/^[a-z0-9_]+$/.test(key)) return key;
  // If ALL_CAPS with underscores (e.g. "KEEP_RUNNING"), just lowercase
  if (/^[A-Z0-9_]+$/.test(key)) return key.toLowerCase();
  return key
    // Insert _ before uppercase that follows lowercase/digit (camelCase boundary)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    // Insert _ before uppercase that is followed by lowercase (handles "HTMLParser" -> "html_parser")
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
