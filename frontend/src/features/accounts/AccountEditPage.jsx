import { Navigate, useParams } from 'react-router-dom';

export default function AccountEditPage() {
  const { id } = useParams();
  if (!id) {
    return <Navigate to="/accounts" replace />;
  }
  return <Navigate to={`/accounts?edit=${id}`} replace />;
}

