import axios from 'axios';

// In production, API is served from the same origin (FastAPI serves both frontend + API).
// Only use VITE_API_URL override for local development.
const API_URL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? '' : 'http://localhost:8000');

const api = axios.create({
  baseURL: API_URL,
  timeout: 120000,
});

export async function uploadFile(file, onProgress, sellCpa, campaignContext) {
  const formData = new FormData();
  formData.append('file', file);
  if (sellCpa != null) {
    formData.append('sell_cpa', String(sellCpa));
  }
  if (campaignContext) {
    if (campaignContext.client_name) formData.append('client_name', campaignContext.client_name);
    if (campaignContext.job_category) formData.append('job_category', campaignContext.job_category);
    if (campaignContext.competitors) formData.append('competitors', campaignContext.competitors);
    if (campaignContext.target_geography) formData.append('target_geography', campaignContext.target_geography);
    if (campaignContext.monthly_budget) formData.append('monthly_budget', String(campaignContext.monthly_budget));
  }
  const response = await api.post('/api/analyse', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress,
  });
  return response.data;
}

export async function fetchInsight(params) {
  const response = await api.post('/api/insights', params);
  return response.data.insight;
}

export function getDownloadUrl(jobId) {
  return `${API_URL}/api/download/${jobId}`;
}

export default api;
