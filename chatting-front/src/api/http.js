import axios from 'axios';

const BASE = (process.env.REACT_APP_CHATTING_SERVER || 'http://localhost:8080').replace(/\/+$/, '');
const http = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwt');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default http;
export { BASE as API_BASE_URL };
