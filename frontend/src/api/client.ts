import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const healthApi = {
  getHealth: () => api.get('/health'),
};

export const incidentsApi = {
  list: () => api.get('/api/incidents'),
  create: (data: { title: string; channel_name?: string }) => 
    api.post('/api/incidents', data),
  getById: (id: string) => api.get(`/api/incidents/${id}`),
  close: (id: string) => api.post(`/api/incidents/${id}/close`),
  delete: (id: string) => api.delete(`/api/incidents/${id}`),
};

export const utterancesApi = {
  add: (incidentId: string, data: { speaker_name: string; text: string }) =>
    api.post(`/api/incidents/${incidentId}/utterances`, data),
};

export const graphApi = {
  getGraph: (incidentId: string) => api.get(`/api/incidents/${incidentId}/graph`),
};

export const documentApi = {
  getDocument: (incidentId: string) => api.get(`/api/incidents/${incidentId}/document`),
  getTimeline: (incidentId: string) => api.get(`/api/incidents/${incidentId}/timeline`),
};

export const actionsApi = {
  getActions: (incidentId: string) => api.get(`/api/incidents/${incidentId}/actions`),
  confirm: (actionId: number, ownerName: string) =>
    api.post(`/api/actions/${actionId}/confirm`, { owner_name: ownerName }),
  reject: (actionId: number) => api.post(`/api/actions/${actionId}/reject`),
};

export const queryApi = {
  query: (incidentId: string, data: { speaker_name: string; text: string }) =>
    api.post(`/api/incidents/${incidentId}/query`, data),
};

export const exportApi = {
  exportMarkdown: (incidentId: string) =>
    api.get(`/api/incidents/${incidentId}/export?format=markdown`),
  exportJson: (incidentId: string) =>
    api.get(`/api/incidents/${incidentId}/export?format=json`),
  emailReport: (incidentId: string, data?: { recipient_email?: string; subject?: string; note?: string }) =>
    api.post(`/api/incidents/${incidentId}/send-email`, data || {}),
};

export const agoraApi = {
  getToken: (channelName: string, uid: number | string) =>
    api.post('/api/agora/token', { channel_name: channelName, uid }),
};

export const followupsApi = {
  getFollowups: (incidentId: string) =>
    api.get(`/api/incidents/${incidentId}/followups`),
};

export const eventsApi = {
  getEventStream: (incidentId: string) => `${API_BASE_URL}/api/incidents/${incidentId}/events`,
};

export const apiClient = api;
export default api;
