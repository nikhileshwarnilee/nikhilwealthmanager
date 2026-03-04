import { http, unwrapApiResponse } from './http';

export async function fetchTransactions(params = {}) {
  const response = await http.get('/transactions/list.php', { params });
  return unwrapApiResponse(response);
}

export async function fetchAllTransactions(params = {}, pageSize = 100) {
  const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 100));
  let page = 1;
  let hasMore = true;
  let total = 0;
  const all = [];

  while (hasMore) {
    const response = await fetchTransactions({
      ...params,
      page,
      limit: normalizedPageSize
    });

    const batch = response.transactions || [];
    all.push(...batch);
    total = Number(response.pagination?.total || all.length);
    hasMore = Boolean(response.pagination?.has_more);
    page += 1;

    if (!batch.length) break;
  }

  return {
    transactions: all,
    pagination: {
      page: 1,
      limit: all.length,
      total,
      has_more: false
    }
  };
}

export async function fetchTransactionView(id) {
  const response = await http.get('/transactions/view.php', { params: { id } });
  return unwrapApiResponse(response);
}

export async function createTransaction(payload) {
  const response = await http.post('/transactions/create.php', payload);
  return unwrapApiResponse(response);
}

export async function updateTransaction(payload) {
  const response = await http.put('/transactions/update.php', payload);
  return unwrapApiResponse(response);
}

export async function uploadTransactionReceipt(file) {
  const formData = new FormData();
  formData.append('receipt', file);
  const response = await http.post('/transactions/upload-receipt.php', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return unwrapApiResponse(response);
}

export async function deleteTransaction(id) {
  const response = await http.delete('/transactions/delete.php', { data: { id } });
  return unwrapApiResponse(response);
}

export async function monthlySummary(params = {}) {
  const response = await http.get('/transactions/monthly-summary.php', { params });
  return unwrapApiResponse(response);
}

export async function categorySummary(params = {}) {
  const response = await http.get('/transactions/category-summary.php', { params });
  return unwrapApiResponse(response);
}

export async function exportTransactionsCsv(query = {}) {
  const response = await http.get('/transactions/export-csv.php', {
    params: query,
    responseType: 'blob'
  });

  const blob = new Blob([response.data], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `transactions-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
