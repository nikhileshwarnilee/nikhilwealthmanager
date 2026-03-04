import { http, unwrapApiResponse } from './http';

export async function register(payload) {
  const response = await http.post('/auth/register.php', payload);
  return unwrapApiResponse(response);
}

export async function login(payload) {
  const response = await http.post('/auth/login.php', payload);
  return unwrapApiResponse(response);
}

export async function getMe() {
  const response = await http.get('/auth/me.php');
  return unwrapApiResponse(response);
}

export async function logout(payload) {
  const response = await http.post('/auth/logout.php', payload || {});
  return unwrapApiResponse(response);
}

export async function updateProfile(payload) {
  const response = await http.post('/auth/update-profile.php', payload);
  return unwrapApiResponse(response);
}

export async function changePassword(payload) {
  const response = await http.post('/auth/change-password.php', payload);
  return unwrapApiResponse(response);
}

export async function forgotPassword(payload) {
  const response = await http.post('/auth/forgot-password.php', payload);
  return unwrapApiResponse(response);
}

export async function resetPassword(payload) {
  const response = await http.post('/auth/reset-password.php', payload);
  return unwrapApiResponse(response);
}
