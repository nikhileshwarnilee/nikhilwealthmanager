import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../../app/ToastContext';
import { normalizeApiError } from '../../services/http';
import { resetPassword } from '../../services/authService';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [params] = useSearchParams();
  const token = useMemo(() => String(params.get('token') || '').trim(), [params]);

  const [form, setForm] = useState({
    new_password: '',
    confirm_password: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!token) {
      pushToast({ type: 'danger', message: 'Invalid reset token.' });
      return;
    }
    if (!form.new_password || !form.confirm_password) {
      pushToast({ type: 'warning', message: 'Fill both password fields.' });
      return;
    }
    if (form.new_password !== form.confirm_password) {
      pushToast({ type: 'warning', message: 'Passwords do not match.' });
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword({
        token,
        new_password: form.new_password,
        confirm_password: form.confirm_password
      });
      pushToast({ type: 'success', message: 'Password reset successful. Please login.' });
      navigate('/login', { replace: true });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-container flex items-center px-4 py-8">
      <div className="card-surface w-full rounded-3xl p-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">Reset Password</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Enter your new password.
        </p>

        {!token ? (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
            Reset token missing or invalid.
          </div>
        ) : null}

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            New Password
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none ring-primary/30 focus:ring dark:border-slate-700 dark:bg-slate-900"
              value={form.new_password}
              onChange={(event) => setForm((prev) => ({ ...prev, new_password: event.target.value }))}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Confirm New Password
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none ring-primary/30 focus:ring dark:border-slate-700 dark:bg-slate-900"
              value={form.confirm_password}
              onChange={(event) => setForm((prev) => ({ ...prev, confirm_password: event.target.value }))}
              placeholder="Re-enter password"
              autoComplete="new-password"
            />
          </label>

          <button
            type="submit"
            disabled={submitting || !token}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-70"
          >
            {submitting ? 'Updating...' : 'Set New Password'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-300">
          Back to{' '}
          <Link className="font-semibold text-primary" to="/login">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
