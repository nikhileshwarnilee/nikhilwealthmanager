import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import AppProviders from './app/AppProviders';
import { ErrorBoundary } from './app/ErrorBoundary';
import './index.css';

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppProviders>
        <App />
      </AppProviders>
    </ErrorBoundary>
  </React.StrictMode>
);
