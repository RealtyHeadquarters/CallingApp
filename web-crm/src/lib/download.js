import api from '../api/client.js';

// Download an authenticated export as a file. Fetches as a blob (so the JWT
// header is sent), then triggers a browser download.
export async function downloadExport(path, params, fallbackName) {
  const res = await api.get(path, { params, responseType: 'blob' });

  // Prefer the server-provided filename.
  let filename = fallbackName || 'export';
  const cd = res.headers['content-disposition'];
  const match = cd && /filename="?([^"]+)"?/.exec(cd);
  if (match) filename = match[1];

  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
