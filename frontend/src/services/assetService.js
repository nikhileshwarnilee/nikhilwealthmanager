import { http, unwrapApiResponse } from './http';

export async function fetchAssets(params = {}) {
  const response = await http.get('/assets/list.php', { params });
  return unwrapApiResponse(response);
}

export async function fetchAssetSummary() {
  const response = await http.get('/assets/summary.php');
  return unwrapApiResponse(response);
}

export async function fetchAssetView(id, params = {}) {
  const response = await http.get('/assets/view.php', {
    params: {
      id,
      ...(params || {})
    }
  });
  return unwrapApiResponse(response);
}

export async function createAssetType(payload) {
  const response = await http.post('/assets/create.php', payload);
  return unwrapApiResponse(response);
}

export async function updateAssetType(payload) {
  const response = await http.put('/assets/update.php', payload);
  return unwrapApiResponse(response);
}

export async function deleteAssetType(id, options = {}) {
  const response = await http.delete('/assets/delete.php', {
    data: { id, ...options }
  });
  return unwrapApiResponse(response);
}

export async function updateAssetValue(payload) {
  const response = await http.post('/assets/update-value.php', payload);
  return unwrapApiResponse(response);
}

export async function fetchAssetReport(params = {}) {
  const response = await http.get('/assets/report.php', { params });
  return unwrapApiResponse(response);
}
