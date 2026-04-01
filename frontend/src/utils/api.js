import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  timeout: 120000,
});

export async function uploadFile(file, onProgress, sellCpa) {
  const formData = new FormData();
  formData.append('file', file);
  if (sellCpa != null) {
    formData.append('sell_cpa', String(sellCpa));
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
