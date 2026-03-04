import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useToast } from '../../app/ToastContext';
import { normalizeApiError } from '../../services/http';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { pushToast } = useToast();

  const [form, setForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!form.email || !form.password) {
      pushToast({ type: 'warning', message: 'Email and password are required.' });
      return;
    }

    setSubmitting(true);
    try {
      await login(form);
      pushToast({ type: 'success', message: 'Login successful.' });
      navigate('/', { replace: true });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-container flex items-center px-4 py-8">
      <div className="card-surface w-full rounded-3xl p-6">
        <p className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">Fintech PWA</p>
        <h1 className="mt-3 text-2xl font-extrabold text-slate-900 dark:text-slate-100">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Track income, expenses, budgets, and insights in one place.
        </p>

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Email
            <input
              type="email"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none ring-primary/30 focus:ring dark:border-slate-700 dark:bg-slate-900"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Password
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none ring-primary/30 focus:ring dark:border-slate-700 dark:bg-slate-900"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="Minimum 8 characters"
              autoComplete="current-password"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-70"
          >
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>

          <div className="text-right">
            <Link className="text-xs font-semibold text-primary" to="/forgot-password">
              Forgot password?
            </Link>
          </div>
        </form>

        <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-300">
          New user?{' '}
          <Link className="font-semibold text-primary" to="/register">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
