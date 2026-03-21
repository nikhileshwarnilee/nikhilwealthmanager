import { http, unwrapApiResponse } from './http';

export async function fetchLedgerSummary() {
  const response = await http.get('/ledger/summary.php');
  return unwrapApiResponse(response);
}

export async function fetchLedgerOverview(params = {}) {
  const response = await http.get('/ledger/overview.php', { params });
  return unwrapApiResponse(response);
}

export async function fetchLedgerOpenItemsReport(params = {}) {
  const response = await http.get('/ledger/report.php', { params });
  return unwrapApiResponse(response);
}

export async function fetchLedgerContactView(id) {
  const response = await http.get('/ledger/view.php', { params: { id } });
  return unwrapApiResponse(response);
}

export async function fetchLedgerContactReport(id, params = {}) {
  const response = await http.get('/ledger/contact-report.php', {
    params: {
      id,
      ...(params || {})
    }
  });
  return unwrapApiResponse(response);
}

export async function fetchLedgerEntry(id) {
  const response = await http.get('/ledger/entry-view.php', { params: { id } });
  return unwrapApiResponse(response);
}

export async function createLedgerContact(payload) {
  const response = await http.post('/ledger/contact-create.php', payload);
  return unwrapApiResponse(response);
}

export async function updateLedgerContact(payload) {
  const response = await http.put('/ledger/contact-update.php', payload);
  return unwrapApiResponse(response);
}

export async function createLedgerEntry(payload) {
  const response = await http.post('/ledger/entry-create.php', payload);
  return unwrapApiResponse(response);
}

export async function updateLedgerEntry(payload) {
  const response = await http.put('/ledger/entry-update.php', payload);
  return unwrapApiResponse(response);
}

export async function deleteLedgerEntry(id) {
  const response = await http.delete('/ledger/entry-delete.php', { data: { id } });
  return unwrapApiResponse(response);
}
