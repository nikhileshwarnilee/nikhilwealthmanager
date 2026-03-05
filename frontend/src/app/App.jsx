import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import PublicRoute from '../components/PublicRoute';
import SkeletonScreen from '../components/SkeletonScreen';
import ToastViewport from '../components/ToastViewport';

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
const CategoriesPage = lazy(() => import('../pages/CategoriesPage'));
const CategoryFormPage = lazy(() => import('../pages/CategoryFormPage'));
const BudgetsPage = lazy(() => import('../pages/BudgetsPage'));
const BudgetViewPage = lazy(() => import('../features/budgets/BudgetViewPage'));
const CategoryViewPage = lazy(() => import('../features/categories/CategoryViewPage'));
const SettingsPage = lazy(() => import('../pages/SettingsPage'));

export default function App() {
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
                <TransactionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions/history"
            element={
              <ProtectedRoute>
                <FullHistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/charts"
            element={
              <ProtectedRoute>
                <ChartsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/category/:id"
            element={
              <ProtectedRoute>
                <CategoryBreakdownPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions/new"
            element={
              <ProtectedRoute>
                <TransactionFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions/:id"
            element={
              <ProtectedRoute>
                <TransactionViewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions/:id/edit"
            element={
              <ProtectedRoute>
                <TransactionFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/budgets"
            element={
              <ProtectedRoute>
                <BudgetsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/budgets/:id"
            element={
              <ProtectedRoute>
                <BudgetViewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts"
            element={
              <ProtectedRoute>
                <AccountsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts/:id"
            element={
              <ProtectedRoute>
                <AccountViewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts/:id/edit"
            element={
              <ProtectedRoute>
                <AccountEditPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assets"
            element={
              <ProtectedRoute>
                <AssetsWealthPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assets/types"
            element={
              <ProtectedRoute>
                <AssetTypesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assets/:id"
            element={
              <ProtectedRoute>
                <AssetViewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/categories"
            element={
              <ProtectedRoute>
                <CategoriesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/categories/:id"
            element={
              <ProtectedRoute>
                <CategoryViewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/categories/new"
            element={
              <ProtectedRoute>
                <CategoryFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/categories/:id/edit"
            element={
              <ProtectedRoute>
                <CategoryFormPage />
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
