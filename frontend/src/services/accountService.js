import { http, unwrapApiResponse } from './http';

export async function fetchAccounts(params = {}) {
  const response = await http.get('/accounts/list.php', { params });
  return unwrapApiResponse(response);
}

export async function fetchAccountView(id, period = null) {
  const params = { id };
  if (period && typeof period === 'object') {
    Object.assign(params, period);
  } else if (period) {
    params.month = period;
  }
  const response = await http.get('/accounts/view.php', { params });
  return unwrapApiResponse(response);
}

export async function createAccount(payload) {
  const response = await http.post('/accounts/create.php', payload);
  return unwrapApiResponse(response);
}

export async function updateAccount(payload) {
  const response = await http.put('/accounts/update.php', payload);
  return unwrapApiResponse(response);
}

export async function adjustOpeningBalance(payload) {
  const response = await http.post('/accounts/adjust-opening.php', payload);
  return unwrapApiResponse(response);
}

export async function deleteAccount(id, options = {}) {
  const response = await http.delete('/accounts/delete.php', {
    data: { id, ...options }
  });
  return unwrapApiResponse(response);
}

export async function accountSummary() {
  const response = await http.get('/accounts/summary.php');
  return unwrapApiResponse(response);
}
