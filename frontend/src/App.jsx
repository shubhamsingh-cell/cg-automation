import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import AuthGate from './components/AuthGate';
import NovaChatWidget from './components/NovaChatWidget';
import Upload from './pages/Upload';
import UploadHistory from './pages/UploadHistory';
import Dashboard from './pages/Dashboard';
import ActionPlan from './pages/ActionPlan';
import Intelligence from './pages/Intelligence';
import Predictor from './pages/Predictor';
import Reports from './pages/Reports';
import LocationDetail from './pages/LocationDetail';
import { useAnalysis } from './context/AnalysisContext';

export default function App() {
  const { data, restoring } = useAnalysis();
  const hasData = !!data;
  const [user, setUser] = useState(null);

  // While restoring persisted data from server, show a brief loading state
  if (restoring) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-[#555] text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <AuthGate onUser={setUser}>
      <Routes>
        <Route element={<Layout user={user} />}>
          <Route path="/" element={hasData ? <Navigate to="/dashboard" replace /> : <Navigate to="/upload" replace />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/upload-history" element={<UploadHistory />} />
          <Route path="/dashboard" element={hasData ? <Dashboard /> : <Navigate to="/upload" replace />} />
          <Route path="/action-plan" element={hasData ? <ActionPlan /> : <Navigate to="/upload" replace />} />
          <Route path="/intelligence" element={hasData ? <Intelligence /> : <Navigate to="/upload" replace />} />
          <Route path="/predictor" element={<Predictor />} />
          <Route path="/reports" element={hasData ? <Reports /> : <Navigate to="/upload" replace />} />
          <Route path="/location/:locationName" element={hasData ? <LocationDetail /> : <Navigate to="/upload" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <NovaChatWidget />
    </AuthGate>
  );
}
