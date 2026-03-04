import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../app/ToastContext';
import { forgotPassword } from '../../services/authService';
import { normalizeApiError } from '../../services/http';

export default function ForgotPasswordPage() {
  const { pushToast } = useToast();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!email.trim()) {
      pushToast({ type: 'warning', message: 'Email is required.' });
      return;
    }

    setSubmitting(true);
    try {
      await forgotPassword({ email: email.trim() });
      setSent(true);
      pushToast({
        type: 'success',
        message: 'If this email is registered, a reset link has been sent.'
      });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-container flex items-center px-4 py-8">
      <div className="card-surface w-full rounded-3xl p-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">Forgot Password</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Enter your login email and we will send a reset link.
        </p>

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Login Email
            <input
              type="email"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none ring-primary/30 focus:ring dark:border-slate-700 dark:bg-slate-900"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-70"
          >
            {submitting ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        {sent ? (
          <p className="mt-3 rounded-xl bg-slate-100 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            If this email is registered, a reset link has been sent.
          </p>
        ) : null}

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
