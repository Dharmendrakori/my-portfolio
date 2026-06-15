// Demo UI -> Admin API bridge for AD lifecycle page
// Replace API base if your Admin API runs on a different host/port.

const API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';

function apiGet(path) {
  return fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin'
  }).then(async (res) => {
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) {
      const msg = json?.error || json?.message || `Request failed: ${res.status}`;
      throw new Error(msg);
    }
    return json;
  });
}

export async function loadUsers({ search = '', limit = 200 } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (limit) params.set('limit', String(limit));
  return apiGet(`/api/ad/users?${params.toString()}`);
}

export async function loadTree() {
  return apiGet('/api/ad/tree');
}

export function pickStatusBadgeClass(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('active') || s.includes('enabled')) return 'status-active';
  if (s.includes('pending')) return 'status-pending';
  return 'status-inactive';
}

