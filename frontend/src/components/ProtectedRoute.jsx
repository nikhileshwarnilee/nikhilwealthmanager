import { Navigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import SkeletonScreen from './SkeletonScreen';

export default function ProtectedRoute({ children }) {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return <SkeletonScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

