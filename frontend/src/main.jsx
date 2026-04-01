import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import posthog from 'posthog-js';
import App from './App';
import { AnalysisProvider } from './context/AnalysisContext';
import './index.css';

posthog.init('phc_rFyVFKwVxSRgnLDvmZndb8npNMPuZfNQmqnzSIkfkS9', {
  api_host: 'https://us.i.posthog.com',
  autocapture: false,
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AnalysisProvider>
        <App />
      </AnalysisProvider>
    </BrowserRouter>
  </React.StrictMode>
);
