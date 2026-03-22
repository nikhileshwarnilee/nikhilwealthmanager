import { http, unwrapApiResponse } from './http';

export async function getSettings() {
  const response = await http.get('/settings/get.php');
  return unwrapApiResponse(response);
}

export async function updateSettings(payload) {
  const response = await http.post('/settings/update.php', payload);
  return unwrapApiResponse(response);
}

export async function resetTransactions(payload) {
  const response = await http.post('/settings/reset-transactions.php', payload);
  return unwrapApiResponse(response);
}

