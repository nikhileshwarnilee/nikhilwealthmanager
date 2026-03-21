import { http, unwrapApiResponse } from './http';

export async function fetchWorkspaceUsers() {
  const response = await http.get('/workspace/users.php');
  return unwrapApiResponse(response);
}
