import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import AuthGate from './components/AuthGate';
import Upload from './pages/Upload';
import Dashboard from './pages/Dashboard';
import ActionPlan from './pages/ActionPlan';
import Intelligence from './pages/Intelligence';
import Reports from './pages/Reports';
import LocationDetail from './pages/LocationDetail';
import { useAnalysis } from './context/AnalysisContext';

export default function App() {
  const { data } = useAnalysis();
  const hasData = !!data;
  const [user, setUser] = useState(null);

  return (
    <AuthGate onUser={setUser}>
      <Routes>
        <Route path="/upload" element={<Upload />} />
        <Route element={<Layout user={user} />}>
          <Route path="/" element={hasData ? <Navigate to="/dashboard" replace /> : <Navigate to="/upload" replace />} />
          <Route path="/dashboard" element={hasData ? <Dashboard /> : <Navigate to="/upload" replace />} />
          <Route path="/action-plan" element={hasData ? <ActionPlan /> : <Navigate to="/upload" replace />} />
          <Route path="/intelligence" element={hasData ? <Intelligence /> : <Navigate to="/upload" replace />} />
          <Route path="/reports" element={hasData ? <Reports /> : <Navigate to="/upload" replace />} />
          <Route path="/location/:locationName" element={hasData ? <LocationDetail /> : <Navigate to="/upload" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthGate>
  );
}
