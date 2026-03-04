import { http, unwrapApiResponse } from './http';

export async function setBudget(payload) {
  const response = await http.post('/budgets/set.php', payload);
  return unwrapApiResponse(response);
}

export async function budgetVsActual(month) {
  const response = await http.get('/budgets/vs-actual.php', { params: { month } });
  return unwrapApiResponse(response);
}

export async function fetchBudgetView(id) {
  const response = await http.get('/budgets/view.php', { params: { id } });
  return unwrapApiResponse(response);
}

export async function budgetAlerts(month) {
  const response = await http.get('/budgets/alerts.php', { params: { month } });
  return unwrapApiResponse(response);
}

export async function deleteBudget(id) {
  const response = await http.delete('/budgets/delete.php', { data: { id } });
  return unwrapApiResponse(response);
}
