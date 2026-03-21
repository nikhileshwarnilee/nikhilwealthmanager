export const DEFAULT_MODULES = {
  businesses: true,
  ledger: true,
  assets: true,
  users_access: true
};

export function normalizeModules(modules) {
  const raw = modules && typeof modules === 'object' ? modules : {};
  return {
    ...DEFAULT_MODULES,
    ...Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, Boolean(value)])
    )
  };
}

export function normalizeAllowedModules(settings) {
  return normalizeModules(settings?.allowed_modules);
}

export function isModuleEnabled(settings, moduleKey) {
  const allowedModules = normalizeAllowedModules(settings);
  return Boolean(normalizeModules(settings?.modules)[moduleKey] && allowedModules[moduleKey]);
}
