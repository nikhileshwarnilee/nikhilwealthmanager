import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import BottomSheet from '../../components/BottomSheet';
import HorizontalSelector from '../../components/HorizontalSelector';
import { useAuth } from '../../app/AuthContext';
import { useTheme } from '../../app/ThemeContext';
import { useToast } from '../../app/ToastContext';
import { changePassword, updateProfile } from '../../services/authService';
import { normalizeApiError } from '../../services/http';
import { getSettings, resetTransactions, updateSettings } from '../../services/settingsService';
import { hapticTap } from '../../utils/haptics';
import { isModuleEnabled } from '../../utils/modules';
import { canManageUsers, hasFeatureAccess, isSuperAdmin } from '../../utils/permissions';

const currencyOptions = [
  { value: 'INR', label: 'INR (Rs)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (EUR)' }
];

const initialPasswordForm = {
  current_password: '',
  new_password: '',
  confirm_password: ''
};

const initialResetForm = {
  current_password: ''
};

export default function SettingsPage() {
  const { user, settings, setUser, setSettings, logout } = useAuth();
  const { darkMode, setDarkMode } = useTheme();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [resetSheetOpen, setResetSheetOpen] = useState(false);
  const [resettingTransactions, setResettingTransactions] = useState(false);
  const [currency, setCurrency] = useState('INR');
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    current_password: ''
  });
  const [passwordForm, setPasswordForm] = useState(initialPasswordForm);
  const [resetForm, setResetForm] = useState(initialResetForm);
  const businessesEnabled = isModuleEnabled(settings, 'businesses');
  const assetsEnabled = isModuleEnabled(settings, 'assets');
  const usersAccessEnabled = Boolean(settings?.workspace_users_access_enabled);
  const categoriesEnabled = hasFeatureAccess(user, 'categories');
  const budgetsEnabled = hasFeatureAccess(user, 'budgets');
  const canEditUsers = canManageUsers(user) && usersAccessEnabled;
  const canResetWorkspace = isSuperAdmin(user);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getSettings();
      setSettings(response.settings || null);
      setCurrency(response.settings?.currency || 'INR');
      const remoteDark = Boolean(Number(response.settings?.dark_mode || 0));
      setDarkMode(remoteDark);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoading(false);
    }
  }, [pushToast, setDarkMode]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setProfileForm((prev) => ({
      ...prev,
      name: user?.name || '',
      email: user?.email || ''
    }));
  }, [user?.name, user?.email]);

  const savePreferences = async (overrides = {}) => {
    setSavingPrefs(true);
    try {
      const response = await updateSettings({
        currency: overrides.currency ?? currency,
        dark_mode: overrides.dark_mode ?? darkMode
      });
      setSettings(response.settings || null);
      pushToast({ type: 'success', message: 'Preferences updated.' });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setSavingPrefs(false);
    }
  };

  const onDarkModeToggle = async (checked) => {
    setDarkMode(checked);
    await savePreferences({ dark_mode: checked });
  };

  const onSaveProfile = async () => {
    const name = profileForm.name.trim();
    const email = profileForm.email.trim();
    const currentPassword = profileForm.current_password;

    if (!name) {
      pushToast({ type: 'warning', message: 'Name is required.' });
      return;
    }
    if (!email) {
      pushToast({ type: 'warning', message: 'Login email is required.' });
      return;
    }

    const emailChanged = email.toLowerCase() !== String(user?.email || '').toLowerCase();
    if (emailChanged && !currentPassword) {
      pushToast({
        type: 'warning',
        message: 'Current password is required to change login email.'
      });
      return;
    }

    setSavingProfile(true);
    try {
      const response = await updateProfile({
        name,
        email,
        current_password: emailChanged ? currentPassword : ''
      });
      if (response?.user) {
        setUser(response.user);
      }
      setProfileForm((prev) => ({ ...prev, current_password: '' }));
      pushToast({ type: 'success', message: 'Profile updated.' });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setSavingProfile(false);
    }
  };

  const onChangePassword = async () => {
    if (!passwordForm.current_password || !passwordForm.new_password || !passwordForm.confirm_password) {
      pushToast({ type: 'warning', message: 'Fill all password fields.' });
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      pushToast({ type: 'warning', message: 'New password and confirm password must match.' });
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword(passwordForm);
      setPasswordForm(initialPasswordForm);
      pushToast({ type: 'success', message: 'Password changed successfully.' });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setSavingPassword(false);
    }
  };

  const closeResetSheet = (force = false) => {
    if (resettingTransactions && !force) return;
    setResetSheetOpen(false);
    setResetForm(initialResetForm);
  };

  const onResetTransactions = async () => {
    if (!resetForm.current_password) {
      pushToast({ type: 'warning', message: 'Enter your current password to continue.' });
      return;
    }

    setResettingTransactions(true);
    try {
      const result = await resetTransactions({
        current_password: resetForm.current_password
      });
      closeResetSheet(true);
      pushToast({
        type: 'success',
        message: `Reset complete. ${Number(result.transactions_deleted || 0)} transaction(s) cleared.`
      });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setResettingTransactions(false);
    }
  };

  return (
    <AppShell title="Profile" subtitle="Account and app preferences" showFab={false} onRefresh={load}>
      <div className="space-y-3">
        <div className="card-surface p-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Profile</h3>
          {loading ? (
            <div className="mt-2 h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ) : (
            <div className="mt-2 space-y-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Name
                <input
                  type="text"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  value={profileForm.name}
                  onChange={(event) =>
                    setProfileForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Login Email
                <input
                  type="email"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  value={profileForm.email}
                  onChange={(event) =>
                    setProfileForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Current Password (only needed for email change)
                <input
                  type="password"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  value={profileForm.current_password}
                  onChange={(event) =>
                    setProfileForm((prev) => ({ ...prev, current_password: event.target.value }))
                  }
                  autoComplete="current-password"
                />
              </label>
              <button
                type="button"
                disabled={savingProfile}
                className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
                onClick={onSaveProfile}
              >
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          )}
        </div>

        <div className="card-surface p-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Change Password</h3>
          <div className="mt-2 space-y-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Current Password
              <input
                type="password"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={passwordForm.current_password}
                onChange={(event) =>
                  setPasswordForm((prev) => ({ ...prev, current_password: event.target.value }))
                }
                autoComplete="current-password"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              New Password
              <input
                type="password"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={passwordForm.new_password}
                onChange={(event) =>
                  setPasswordForm((prev) => ({ ...prev, new_password: event.target.value }))
                }
                autoComplete="new-password"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Confirm New Password
              <input
                type="password"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={passwordForm.confirm_password}
                onChange={(event) =>
                  setPasswordForm((prev) => ({ ...prev, confirm_password: event.target.value }))
                }
                autoComplete="new-password"
              />
            </label>
            <button
              type="button"
              disabled={savingPassword}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
              onClick={onChangePassword}
            >
              {savingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </div>

        <div className="card-surface p-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Session</h3>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
            Your login stays active on this device until you manually logout or clear app/browser storage.
          </p>
        </div>

        <div className="card-surface p-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Appearance</h3>
          <div className="mt-2 flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Dark mode</p>
            <label className="inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={darkMode}
                onChange={(event) => onDarkModeToggle(event.target.checked)}
              />
              <span className="relative h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-primary">
                <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
              </span>
            </label>
          </div>
        </div>

        <div className="card-surface p-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Currency</h3>
          <div className="mt-2 space-y-2">
            <HorizontalSelector
              items={currencyOptions}
              selected={currency}
              onSelect={(value) => {
                hapticTap();
                setCurrency(value);
              }}
            />
            <button
              type="button"
              disabled={savingPrefs}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
              onClick={() => savePreferences({ currency })}
            >
              {savingPrefs ? 'Saving...' : 'Save Currency'}
            </button>
          </div>
        </div>

        <div className="card-surface p-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Manage Data</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link
              to="/settings/modules"
              className="rounded-xl bg-slate-100 px-3 py-3 text-center text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Modules
            </Link>
            {categoriesEnabled ? (
              <Link
                to="/categories"
                className="rounded-xl bg-slate-100 px-3 py-3 text-center text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Categories
              </Link>
            ) : null}
            {budgetsEnabled ? (
              <Link
                to="/budgets"
                className="rounded-xl bg-slate-100 px-3 py-3 text-center text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Budgets
              </Link>
            ) : null}
            {businessesEnabled ? (
              <Link
                to="/businesses"
                className="rounded-xl bg-slate-100 px-3 py-3 text-center text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Businesses
              </Link>
            ) : null}
            {assetsEnabled ? (
              <Link
                to="/assets/types"
                className="rounded-xl bg-slate-100 px-3 py-3 text-center text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Asset Types
              </Link>
            ) : null}
            {canEditUsers ? (
              <Link
                to="/settings/users"
                className="rounded-xl bg-slate-100 px-3 py-3 text-center text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Users & Access
              </Link>
            ) : null}
            {canResetWorkspace ? (
              <button
                type="button"
                className="col-span-2 rounded-xl bg-amber-500 px-3 py-3 text-sm font-semibold text-white"
                onClick={() => setResetSheetOpen(true)}
              >
                Reset
              </button>
            ) : null}
            <button
              type="button"
              className="col-span-2 rounded-xl bg-danger px-3 py-3 text-sm font-semibold text-white"
              onClick={logout}
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <BottomSheet open={resetSheetOpen} onClose={closeResetSheet} title="Reset Transactions">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This reset clears transaction history and keeps today&apos;s account balances as the new opening balances.
          </p>

          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
            <p className="font-semibold">What will be deleted</p>
            <ul className="mt-2 space-y-1">
              <li>All income, expense, transfer, asset, and opening-adjustment transactions saved so far.</li>
              <li>Attached receipt files linked to those transactions.</li>
              <li>Transaction history used by reports, charts, and full history screens.</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100">
            <p className="font-semibold">What will stay</p>
            <ul className="mt-2 space-y-1">
              <li>All accounts stay intact, and each current balance becomes that account&apos;s new opening balance.</li>
              <li>Receivables, payables, and ledger contacts stay intact.</li>
              <li>Categories, budgets, businesses, asset types, users, and app settings stay intact.</li>
            </ul>
          </div>

          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Current Password
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={resetForm.current_password}
              onChange={(event) =>
                setResetForm((prev) => ({ ...prev, current_password: event.target.value }))
              }
              autoComplete="current-password"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              onClick={closeResetSheet}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={resettingTransactions}
              className="rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
              onClick={onResetTransactions}
            >
              {resettingTransactions ? 'Resetting...' : 'Reset'}
            </button>
          </div>
        </div>
      </BottomSheet>
    </AppShell>
  );
}
