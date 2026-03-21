import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import PublicRoute from '../components/PublicRoute';
import SkeletonScreen from '../components/SkeletonScreen';
import ToastViewport from '../components/ToastViewport';
import { isModuleEnabled } from '../utils/modules';
import { canManageUsers, hasFeatureAccess } from '../utils/permissions';

const LoginPage = lazy(() => import('../features/auth/LoginPage'));
const RegisterPage = lazy(() => import('../features/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('../features/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('../features/auth/ResetPasswordPage'));
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'));
const ChartsPage = lazy(() => import('../features/dashboard/ChartsPage'));
const CategoryBreakdownPage = lazy(() => import('../features/reports/CategoryBreakdownPage'));
const TransactionsPage = lazy(() => import('../features/transactions/TransactionsPage'));
const FullHistoryPage = lazy(() => import('../features/transactions/FullHistoryPage'));
const TransactionFormPage = lazy(() => import('../features/transactions/TransactionFormPage'));
const TransactionViewPage = lazy(() => import('../features/transactions/TransactionViewPage'));
const AccountsPage = lazy(() => import('../features/accounts/AccountsPage'));
const AccountViewPage = lazy(() => import('../features/accounts/AccountViewPage'));
const AccountEditPage = lazy(() => import('../features/accounts/AccountEditPage'));
const AssetsWealthPage = lazy(() => import('../features/assets/AssetsWealthPage'));
const AssetTypesPage = lazy(() => import('../features/assets/AssetTypesPage'));
const AssetViewPage = lazy(() => import('../features/assets/AssetViewPage'));
const BusinessesPage = lazy(() => import('../features/businesses/BusinessesPage'));
const LedgerPage = lazy(() => import('../features/ledger/LedgerPage'));
const LedgerContactPage = lazy(() => import('../features/ledger/LedgerContactPage'));
const CategoriesPage = lazy(() => import('../pages/CategoriesPage'));
const CategoryFormPage = lazy(() => import('../pages/CategoryFormPage'));
const BudgetsPage = lazy(() => import('../pages/BudgetsPage'));
const BudgetViewPage = lazy(() => import('../features/budgets/BudgetViewPage'));
const CategoryViewPage = lazy(() => import('../features/categories/CategoryViewPage'));
const SettingsPage = lazy(() => import('../pages/SettingsPage'));
const ModulesPage = lazy(() => import('../features/settings/ModulesPage'));
const UsersPage = lazy(() => import('../features/settings/UsersPage'));

export default function App() {
  const { user, settings } = useAuth();
  const businessesEnabled = isModuleEnabled(settings, 'businesses');
  const ledgerEnabled = isModuleEnabled(settings, 'ledger');
  const assetsEnabled = isModuleEnabled(settings, 'assets');
  const transactionsEnabled = hasFeatureAccess(user, 'transactions');
  const accountsEnabled = hasFeatureAccess(user, 'accounts');
  const categoriesEnabled = hasFeatureAccess(user, 'categories');
  const budgetsEnabled = hasFeatureAccess(user, 'budgets');
  const chartsEnabled = hasFeatureAccess(user, 'charts');
  const reportsEnabled = hasFeatureAccess(user, 'reports');
  const usersEnabled = canManageUsers(user) && Boolean(settings?.workspace_users_access_enabled);

  return (
    <>
      <Suspense fallback={<SkeletonScreen />}>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <RegisterPage />
              </PublicRoute>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <PublicRoute>
                <ForgotPasswordPage />
              </PublicRoute>
            }
          />
          <Route
            path="/reset-password"
            element={
              <PublicRoute>
                <ResetPasswordPage />
              </PublicRoute>
            }
          />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions"
            element={
              <ProtectedRoute>
                {transactionsEnabled ? <TransactionsPage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions/history"
            element={
              <ProtectedRoute>
                {transactionsEnabled ? <FullHistoryPage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/charts"
            element={
              <ProtectedRoute>
                {chartsEnabled ? <ChartsPage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/category/:id"
            element={
              <ProtectedRoute>
                {reportsEnabled ? <CategoryBreakdownPage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions/new"
            element={
              <ProtectedRoute>
                {transactionsEnabled ? <TransactionFormPage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions/:id"
            element={
              <ProtectedRoute>
                {transactionsEnabled ? <TransactionViewPage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions/:id/edit"
            element={
              <ProtectedRoute>
                {transactionsEnabled ? <TransactionFormPage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/budgets"
            element={
              <ProtectedRoute>
                {budgetsEnabled ? <BudgetsPage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/budgets/:id"
            element={
              <ProtectedRoute>
                {budgetsEnabled ? <BudgetViewPage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts"
            element={
              <ProtectedRoute>
                {accountsEnabled ? <AccountsPage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts/:id"
            element={
              <ProtectedRoute>
                {accountsEnabled ? <AccountViewPage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts/:id/edit"
            element={
              <ProtectedRoute>
                {accountsEnabled ? <AccountEditPage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/assets"
            element={
              <ProtectedRoute>
                {assetsEnabled ? <AssetsWealthPage /> : <Navigate to="/settings/modules" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/assets/types"
            element={
              <ProtectedRoute>
                {assetsEnabled ? <AssetTypesPage /> : <Navigate to="/settings/modules" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/assets/:id"
            element={
              <ProtectedRoute>
                {assetsEnabled ? <AssetViewPage /> : <Navigate to="/settings/modules" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/businesses"
            element={
              <ProtectedRoute>
                {businessesEnabled ? <BusinessesPage /> : <Navigate to="/settings/modules" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/ledger"
            element={
              <ProtectedRoute>
                {ledgerEnabled ? <LedgerPage /> : <Navigate to="/settings/modules" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/ledger/contacts/:id"
            element={
              <ProtectedRoute>
                {ledgerEnabled ? <LedgerContactPage /> : <Navigate to="/settings/modules" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/modules"
            element={
              <ProtectedRoute>
                <ModulesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/categories"
            element={
              <ProtectedRoute>
                {categoriesEnabled ? <CategoriesPage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/categories/:id"
            element={
              <ProtectedRoute>
                {categoriesEnabled ? <CategoryViewPage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/categories/new"
            element={
              <ProtectedRoute>
                {categoriesEnabled ? <CategoryFormPage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/categories/:id/edit"
            element={
              <ProtectedRoute>
                {categoriesEnabled ? <CategoryFormPage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/users"
            element={
              <ProtectedRoute>
                {usersEnabled ? <UsersPage /> : <Navigate to="/settings" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <ToastViewport />
    </>
  );
}
