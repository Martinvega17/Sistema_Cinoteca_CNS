/**
 * Wrapper de fetch para hablar con las funciones serverless de /api.
 * - Siempre manda la cookie de sesión (credentials: 'include').
 * - Si el servidor responde con { error: '...' }, lo convierte en una
 *   excepción de JS con ese mensaje, para poder mostrarlo directo en un
 *   toast sin tener que repetir el manejo de errores en cada módulo.
 */
async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!res.ok) {
    const message = (data && data.error) || `Error ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body })
};
