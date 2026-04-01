import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Upload from './pages/Upload';
import DailyActionPlan from './pages/DailyActionPlan';
import LocationDetail from './pages/LocationDetail';
import AllRepost from './pages/AllRepost';
import LocationConflicts from './pages/LocationConflicts';
import KeepRunning from './pages/KeepRunning';
import Skip from './pages/Skip';
import TitleAnalysis from './pages/TitleAnalysis';
import CategoryAnalysis from './pages/CategoryAnalysis';
import BestDayAnalysis from './pages/BestDayAnalysis';
import FrequencyOptimization from './pages/FrequencyOptimization';
import LocationMultipliers from './pages/LocationMultipliers';
import Scorecard from './pages/Scorecard';
import DownloadExcel from './pages/DownloadExcel';
import { useAnalysis } from './context/AnalysisContext';

export default function App() {
  const { data } = useAnalysis();
  const hasData = !!data;

  return (
    <Routes>
      <Route path="/upload" element={<Upload />} />
      <Route element={<Layout />}>
        <Route path="/" element={hasData ? <Navigate to="/action-plan" replace /> : <Navigate to="/upload" replace />} />
        <Route path="/action-plan" element={hasData ? <DailyActionPlan /> : <Navigate to="/upload" replace />} />
        <Route path="/location/:locationName" element={hasData ? <LocationDetail /> : <Navigate to="/upload" replace />} />
        <Route path="/repost" element={hasData ? <AllRepost /> : <Navigate to="/upload" replace />} />
        <Route path="/conflicts" element={hasData ? <LocationConflicts /> : <Navigate to="/upload" replace />} />
        <Route path="/keep-running" element={hasData ? <KeepRunning /> : <Navigate to="/upload" replace />} />
        <Route path="/skip" element={hasData ? <Skip /> : <Navigate to="/upload" replace />} />
        <Route path="/titles" element={hasData ? <TitleAnalysis /> : <Navigate to="/upload" replace />} />
        <Route path="/categories" element={hasData ? <CategoryAnalysis /> : <Navigate to="/upload" replace />} />
        <Route path="/best-day" element={hasData ? <BestDayAnalysis /> : <Navigate to="/upload" replace />} />
        <Route path="/frequency" element={hasData ? <FrequencyOptimization /> : <Navigate to="/upload" replace />} />
        <Route path="/multipliers" element={hasData ? <LocationMultipliers /> : <Navigate to="/upload" replace />} />
        <Route path="/scorecard" element={hasData ? <Scorecard /> : <Navigate to="/upload" replace />} />
        <Route path="/download" element={hasData ? <DownloadExcel /> : <Navigate to="/upload" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
