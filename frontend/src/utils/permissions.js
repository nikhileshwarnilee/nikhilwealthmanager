export const DEFAULT_FEATURE_PERMISSIONS = {
  transactions: true,
  accounts: true,
  categories: true,
  budgets: true,
  charts: true,
  reports: true,
  businesses: true,
  ledger: true,
  assets: true
};

export const DEFAULT_TRANSACTION_ACCESS = {
  edit: 'own',
  delete: 'own'
};

export const TRANSACTION_SCOPE_OPTIONS = [
  {
    value: 'none',
    label: 'No',
    description: 'Block this action for the user.'
  },
  {
    value: 'own',
    label: 'Own Only',
    description: 'Allow only on transactions created by this user.'
  },
  {
    value: 'any',
    label: 'Any',
    description: 'Allow on any shared workspace transaction.'
  }
];

export function normalizeFeaturePermissions(permissions) {
  const raw = permissions && typeof permissions === 'object' ? permissions : {};
  return {
    ...DEFAULT_FEATURE_PERMISSIONS,
    ...Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, Boolean(value)])
    )
  };
}

export function normalizeTransactionAccess(access) {
  const raw = access && typeof access === 'object' ? access : {};
  return {
    edit: ['none', 'own', 'any'].includes(String(raw.edit || '').toLowerCase())
      ? String(raw.edit).toLowerCase()
      : DEFAULT_TRANSACTION_ACCESS.edit,
    delete: ['none', 'own', 'any'].includes(String(raw.delete || '').toLowerCase())
      ? String(raw.delete).toLowerCase()
      : DEFAULT_TRANSACTION_ACCESS.delete
  };
}

export function isSuperAdmin(user) {
  return String(user?.role || '').toLowerCase() === 'super_admin';
}

export function hasFeatureAccess(user, featureKey) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  return Boolean(normalizeFeaturePermissions(user?.permissions)[featureKey]);
}

export function canManageUsers(user) {
  return isSuperAdmin(user);
}

export function transactionScopeLabel(scope) {
  const normalized = String(scope || '').toLowerCase();
  return TRANSACTION_SCOPE_OPTIONS.find((option) => option.value === normalized)?.label || 'Own Only';
}

function transactionCreatorId(transaction) {
  return Number(
    transaction?.created_by_user_id
      || transaction?.created_by?.id
      || 0
  );
}

export function canManageTransactionAction(user, transaction, action) {
  if (!user || !transaction) return false;
  if (Boolean(transaction?.permissions?.[`can_${action}`]) || transaction?.permissions?.[`can_${action}`] === false) {
    return Boolean(transaction.permissions[`can_${action}`]);
  }
  if (isSuperAdmin(user)) return true;

  const scope = normalizeTransactionAccess(user?.transaction_access)[action];
  if (scope === 'any') return true;
  if (scope === 'none') return false;

  return Number(user?.id || 0) > 0 && Number(user?.id || 0) === transactionCreatorId(transaction);
}

export function canEditTransaction(user, transaction) {
  return canManageTransactionAction(user, transaction, 'edit');
}

export function canDeleteTransaction(user, transaction) {
  return canManageTransactionAction(user, transaction, 'delete');
}
