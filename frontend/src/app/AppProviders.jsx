import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import { ToastProvider } from './ToastContext';

export default function AppProviders({ children }) {
  const rawBase = import.meta.env.BASE_URL || '/';
  const basename = rawBase === '/' ? undefined : rawBase.replace(/\/$/, '');

  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter basename={basename}>{children}</BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
