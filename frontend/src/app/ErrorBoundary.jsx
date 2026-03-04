import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // Keep console logging for diagnostics in local/shared hosting.
    // eslint-disable-next-line no-console
    console.error('UI error boundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto min-h-screen w-full max-w-app bg-appbg p-4 dark:bg-slate-950">
          <div className="card-surface mt-10 p-6 text-center">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Something broke</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Please refresh the app. If this continues, clear site data and login again.
            </p>
            <button
              type="button"
              className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
              onClick={() => window.location.reload()}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

