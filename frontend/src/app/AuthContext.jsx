import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getMe, login, logout, register } from '../services/authService';
import { normalizeApiError } from '../services/http';
import { clearAuthSession, getAuthSession, setAuthSession } from '../services/tokenStore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);

  const persist = useCallback((nextUser, nextSettings, nextAccess, nextRefresh) => {
    setUser(nextUser);
    setSettings(nextSettings || null);
    setAccessToken(nextAccess);
    setRefreshToken(nextRefresh);
    setAuthSession({
      user: nextUser,
      settings: nextSettings || null,
      accessToken: nextAccess,
      refreshToken: nextRefresh
    });
  }, []);

  const clear = useCallback(() => {
    setUser(null);
    setSettings(null);
    setAccessToken(null);
    setRefreshToken(null);
    clearAuthSession();
  }, []);

  const updateUser = useCallback((nextUser) => {
    setUser(nextUser);
    const session = getAuthSession();
    if (session?.accessToken || session?.refreshToken) {
      setAuthSession({
        ...session,
        user: nextUser
      });
    }
  }, []);

  const updateSettings = useCallback((nextSettings) => {
    setSettings(nextSettings || null);
    const session = getAuthSession();
    if (session?.accessToken || session?.refreshToken) {
      setAuthSession({
        ...session,
        settings: nextSettings || null
      });
    }
  }, []);

  const hydrate = useCallback(async () => {
    const session = getAuthSession();
    if (!session?.accessToken || !session?.refreshToken) {
      clear();
      setLoading(false);
      return;
    }

    setAccessToken(session.accessToken);
    setRefreshToken(session.refreshToken);
    setUser(session.user || null);
    setSettings(session.settings || null);
    setLoading(false);

    try {
      const data = await getMe();
      setAuthSession({
        user: data.user,
        settings: data.settings || null,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken
      });
      setUser(data.user);
      setSettings(data.settings || null);
    } catch (error) {
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        clear();
      }
    }
  }, [clear]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const onForcedLogout = () => clear();
    window.addEventListener('auth:logout', onForcedLogout);
    return () => window.removeEventListener('auth:logout', onForcedLogout);
  }, [clear]);

  const loginUser = useCallback(
    async (payload) => {
      const data = await login(payload);
      persist(data.user, data.settings || null, data.access_token, data.refresh_token);
      return data;
    },
    [persist]
  );

  const registerUser = useCallback(
    async (payload) => {
      const data = await register(payload);
      persist(data.user, data.settings || null, data.access_token, data.refresh_token);
      return data;
    },
    [persist]
  );

  const logoutUser = useCallback(async () => {
    try {
      if (refreshToken) {
        await logout({ refresh_token: refreshToken });
      }
    } catch (error) {
      normalizeApiError(error);
    } finally {
      clear();
    }
  }, [clear, refreshToken]);

  const value = useMemo(
    () => ({
      user,
      settings,
      accessToken,
      refreshToken,
      loading,
      isAuthenticated: Boolean(accessToken),
      login: loginUser,
      register: registerUser,
      logout: logoutUser,
      setUser: updateUser,
      setSettings: updateSettings
    }),
    [user, settings, accessToken, refreshToken, loading, loginUser, registerUser, logoutUser, updateUser, updateSettings]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
