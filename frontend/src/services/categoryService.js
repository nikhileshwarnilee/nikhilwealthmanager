import { http, unwrapApiResponse } from './http';

export async function fetchCategories(params = {}) {
  const response = await http.get('/categories/list.php', { params });
  return unwrapApiResponse(response);
}

export async function fetchCategoryView(id, period = null) {
  const params = { id };
  if (period && typeof period === 'object') {
    Object.assign(params, period);
  } else if (period) {
    params.month = period;
  }
  const response = await http.get('/categories/view.php', { params });
  return unwrapApiResponse(response);
}

export async function createCategory(payload) {
  const response = await http.post('/categories/create.php', payload);
  return unwrapApiResponse(response);
}

export async function updateCategory(payload) {
  const response = await http.put('/categories/update.php', payload);
  return unwrapApiResponse(response);
}

export async function deleteCategory(id, options = {}) {
  const response = await http.delete('/categories/delete.php', {
    data: { id, ...options }
  });
  return unwrapApiResponse(response);
}

export async function uploadCategoryIcon(file) {
  const formData = new FormData();
  formData.append('icon', file);
  const response = await http.post('/categories/upload-icon.php', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return unwrapApiResponse(response);
}

export async function reorderCategories(type, orderedIds) {
  const response = await http.post('/categories/reorder.php', {
    type,
    ordered_ids: orderedIds
  });
  return unwrapApiResponse(response);
}

export async function seedDefaultCategories() {
  const response = await http.post('/categories/seed-defaults.php');
  return unwrapApiResponse(response);
}
