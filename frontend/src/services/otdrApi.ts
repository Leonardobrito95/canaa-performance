import axios from 'axios';

const api = axios.create({ baseURL: '/bdr/api/v1/otdr' });

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('bdr_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export const getOtdrLink = () => api.get<{ url: string }>('/link').then(r => r.data);
