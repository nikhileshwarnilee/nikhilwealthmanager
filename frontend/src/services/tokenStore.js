import { readStorage, removeStorage, writeStorage } from '../utils/storage';

const AUTH_KEY = 'expense_manager_auth_v2';

export function getAuthSession() {
  return readStorage(AUTH_KEY, {
    accessToken: null,
    refreshToken: null,
    user: null
  });
}

export function setAuthSession(session) {
  writeStorage(AUTH_KEY, session);
}

export function clearAuthSession() {
  removeStorage(AUTH_KEY);
}

export function getAccessToken() {
  return getAuthSession()?.accessToken || null;
}

export function getRefreshToken() {
  return getAuthSession()?.refreshToken || null;
}

