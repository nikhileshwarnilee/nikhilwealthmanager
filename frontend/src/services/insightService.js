import { http, unwrapApiResponse } from './http';

export async function monthlyInsights(month) {
  const response = await http.get('/insights/monthly.php', { params: { month } });
  return unwrapApiResponse(response);
}

export async function analyticsOverview(params = {}) {
  const query = params && typeof params === 'object' ? params : { month: params };
  const response = await http.get('/insights/analytics.php', { params: query });
  return unwrapApiResponse(response);
}
