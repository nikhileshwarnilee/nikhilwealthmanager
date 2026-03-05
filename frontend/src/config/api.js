const configuredBase = String(import.meta.env.VITE_API_BASE_URL || '').trim();
const appBaseRaw = import.meta.env.BASE_URL || '/';
const appBase = appBaseRaw.endsWith('/') ? appBaseRaw.slice(0, -1) : appBaseRaw;
const inferredBase = appBase ? `${appBase}/api` : '/api';

function isLoopbackHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function normalizeBase(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function resolveApiBase() {
  if (!configuredBase) {
    return inferredBase;
  }

  // Relative base keeps local-network dev stable through Vite proxy.
  if (configuredBase.startsWith('/')) {
    if (configuredBase === '/api' && appBase) {
      return `${appBase}/api`;
    }
    return normalizeBase(configuredBase);
  }

  if (typeof window === 'undefined') {
    return normalizeBase(configuredBase);
  }

  try {
    const parsed = new URL(configuredBase, window.location.origin);
    const appHost = window.location.hostname;
    const configuredIsLoopback = isLoopbackHost(parsed.hostname);
    const appIsLoopback = isLoopbackHost(appHost);

    // If app is opened from LAN IP but env points to localhost, route to current host.
    if (configuredIsLoopback && !appIsLoopback) {
      if (import.meta.env.DEV) {
        return '/api';
      }
      parsed.hostname = appHost;
      parsed.protocol = window.location.protocol;
      if (!window.location.port) {
        parsed.port = '';
      }
    }

    return normalizeBase(parsed.toString());
  } catch (_error) {
    return normalizeBase(configuredBase);
  }
}

export const API_BASE = resolveApiBase();
