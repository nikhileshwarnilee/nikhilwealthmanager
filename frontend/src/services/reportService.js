import { http, unwrapApiResponse } from './http';

export async function fetchCategorySummaryReport(params = {}) {
  const response = await http.get('/reports/category-summary.php', { params });
  return unwrapApiResponse(response);
}

export async function fetchCategoryBreakdownReport(params = {}) {
  const response = await http.get('/reports/category-breakdown.php', { params });
  return unwrapApiResponse(response);
}

