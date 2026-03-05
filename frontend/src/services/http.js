import axios from 'axios';
import { clearAuthSession, getAccessToken, getRefreshToken, getAuthSession, setAuthSession } from './tokenStore';

const appBaseRaw = import.meta.env.BASE_URL || '/';
const appBase = appBaseRaw.endsWith('/') ? appBaseRaw.slice(0, -1) : appBaseRaw;
const inferredApiBase = appBase ? `${appBase}/api` : '/api';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || inferredApiBase;

export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000
});

let refreshingPromise = null;

http.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error?.response?.status;

    if (status === 401 && originalRequest && !originalRequest.__isRetryRequest) {
      if (!refreshingPromise) {
        const refreshToken = getRefreshToken();
        if (!refreshToken) {
          clearAuthSession();
          window.dispatchEvent(new CustomEvent('auth:logout'));
          return Promise.reject(error);
        }

        refreshingPromise = axios
          .post(`${API_BASE_URL}/auth/refresh.php`, { refresh_token: refreshToken }, { timeout: 15000 })
          .then((res) => {
            const data = res?.data?.data;
            if (!data?.access_token || !data?.refresh_token) {
              throw new Error('Invalid refresh response.');
            }

            const existing = getAuthSession();
            setAuthSession({
              ...existing,
              accessToken: data.access_token,
              refreshToken: data.refresh_token
            });

            return data.access_token;
          })
          .catch((refreshError) => {
            const refreshStatus = refreshError?.response?.status;
            if (refreshStatus === 401 || refreshStatus === 403) {
              clearAuthSession();
              window.dispatchEvent(new CustomEvent('auth:logout'));
            }
            throw refreshError;
          })
          .finally(() => {
            refreshingPromise = null;
          });
      }

      const newAccessToken = await refreshingPromise;
      originalRequest.__isRetryRequest = true;
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return http(originalRequest);
    }

    return Promise.reject(error);
  }
);

export function unwrapApiResponse(response) {
  const payload = response?.data;
  if (!payload || payload.success !== true) {
    const message = payload?.message || 'Request failed.';
    const err = new Error(message);
    err.details = payload?.data?.errors || null;
    throw err;
  }
  return payload.data || {};
}

export function normalizeApiError(error) {
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  if (error?.message) {
    return error.message;
  }
  return 'Something went wrong.';
}
