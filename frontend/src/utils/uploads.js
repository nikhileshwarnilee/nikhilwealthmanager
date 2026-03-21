import { API_BASE_URL } from '../services/http';

export function buildBackendFileUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = API_BASE_URL.replace(/\/api\/?$/, '');
  return `${base}/backend/${String(path).replace(/^\/+/, '')}`;
}
