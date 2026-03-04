import { Navigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import SkeletonScreen from './SkeletonScreen';

export default function PublicRoute({ children }) {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return <SkeletonScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

