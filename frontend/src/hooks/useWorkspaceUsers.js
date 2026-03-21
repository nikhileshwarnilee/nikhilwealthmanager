import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../app/ToastContext';
import { normalizeApiError } from '../services/http';
import { fetchWorkspaceUsers } from '../services/workspaceService';

export function useWorkspaceUsers(enabled) {
  const { pushToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!enabled) {
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetchWorkspaceUsers();
      setUsers(response.users || []);
    } catch (error) {
      setUsers([]);
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoading(false);
    }
  }, [enabled, pushToast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  return {
    users,
    loading,
    reload: loadUsers
  };
}
