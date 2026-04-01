import { createContext, useContext, useState, useCallback } from 'react';

const AnalysisContext = createContext(null);

export function AnalysisProvider({ children }) {
  const [data, setData] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [insightsCache, setInsightsCache] = useState({});

  const loadAnalysis = useCallback((analysisData) => {
    setData(analysisData);
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
