import { http, unwrapApiResponse } from './http';

export async function fetchAdminUsers() {
  const response = await http.get('/admin/users/list.php');
  return unwrapApiResponse(response);
}

export async function createAdminUser(payload) {
  const response = await http.post('/admin/users/create.php', payload);
  return unwrapApiResponse(response);
}

export async function updateAdminUser(payload) {
  const response = await http.post('/admin/users/update.php', payload);
  return unwrapApiResponse(response);
}
