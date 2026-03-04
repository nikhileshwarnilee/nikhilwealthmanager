import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useToast } from '../../app/ToastContext';
import { normalizeApiError } from '../../services/http';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { pushToast } = useToast();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!form.name || !form.email || !form.password) {
      pushToast({ type: 'warning', message: 'All fields are required.' });
      return;
    }
    if (form.password.length < 8) {
      pushToast({ type: 'warning', message: 'Password must be at least 8 characters.' });
      return;
    }
    if (form.password !== form.confirmPassword) {
      pushToast({ type: 'warning', message: 'Passwords do not match.' });
      return;
    }

    setSubmitting(true);
    try {
      await register({
        name: form.name,
        email: form.email,
        password: form.password
      });
      pushToast({ type: 'success', message: 'Account created successfully.' });
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
        <p className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">Join now</p>
        <h1 className="mt-3 text-2xl font-extrabold text-slate-900 dark:text-slate-100">Create account</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Build budgets, monitor trends, and get monthly insights.
        </p>

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Name
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none ring-primary/30 focus:ring dark:border-slate-700 dark:bg-slate-900"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Your full name"
              autoComplete="name"
            />
          </label>

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
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Confirm password
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none ring-primary/30 focus:ring dark:border-slate-700 dark:bg-slate-900"
              value={form.confirmPassword}
              onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
              placeholder="Repeat password"
              autoComplete="new-password"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-70"
          >
            {submitting ? 'Creating...' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-300">
          Already have an account?{' '}
          <Link className="font-semibold text-primary" to="/login">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}

