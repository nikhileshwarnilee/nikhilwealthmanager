import { http, unwrapApiResponse } from './http';

export async function fetchBusinesses(params = {}) {
  const response = await http.get('/businesses/list.php', { params });
  return unwrapApiResponse(response);
}

export async function createBusiness(payload) {
  const response = await http.post('/businesses/create.php', payload);
  return unwrapApiResponse(response);
}

export async function updateBusiness(payload) {
  const response = await http.put('/businesses/update.php', payload);
  return unwrapApiResponse(response);
}

export async function deleteBusiness(id) {
  const response = await http.delete('/businesses/delete.php', { data: { id } });
  return unwrapApiResponse(response);
}
