const BASE = '/api';

function getTokens() {
  return {
    accessToken: localStorage.getItem('accessToken'),
    refreshToken: localStorage.getItem('refreshToken'),
  };
}

function setAccessToken(token) {
  localStorage.setItem('accessToken', token);
}

export function setTokens({ accessToken, refreshToken }) {
  localStorage.setItem('accessToken', accessToken);
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

async function refreshAccessToken() {
  const { refreshToken } = getTokens();
  if (!refreshToken) throw new Error('no refresh token');
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new Error('refresh failed');
  const data = await res.json();
  setAccessToken(data.accessToken);
  return data.accessToken;
}

export async function api(path, { method = 'GET', body, isFormData = false, _retried = false } = {}) {
  const { accessToken } = getTokens();
  const headers = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: isFormData ? body : body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The server took too long to respond. Check that the backend is running on port 4000.');
    throw new Error('Unable to reach the server. Check that the backend is running on port 4000.');
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 401 && accessToken && !_retried) {
    try {
      await refreshAccessToken();
      return api(path, { method, body, isFormData, _retried: true });
    } catch {
      clearTokens();
      window.location.href = '/login';
      throw new Error('session expired');
    }
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ? JSON.stringify(data.error) : `request failed: ${res.status}`);
  return data;
}
