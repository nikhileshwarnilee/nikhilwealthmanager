let authSessionCache = {
  accessToken: null,
  refreshToken: null,
  user: null,
  settings: null
};

function normalizeSession(session) {
  const raw = session && typeof session === 'object' ? session : {};
  return {
    accessToken: raw.accessToken || null,
    refreshToken: raw.refreshToken || null,
    user: raw.user || null,
    settings: raw.settings || null
  };
}

export function getAuthSession() {
  return normalizeSession(authSessionCache);
}

export function setAuthSession(session) {
  authSessionCache = normalizeSession(session);
}

export function clearAuthSession() {
  authSessionCache = {
    accessToken: null,
    refreshToken: null,
    user: null,
    settings: null
  };
}

export function getAccessToken() {
  return getAuthSession()?.accessToken || null;
}

export function getRefreshToken() {
  return getAuthSession()?.refreshToken || null;
}
