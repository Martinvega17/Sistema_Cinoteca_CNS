import { api } from './api.js';

// OJO: estos elementos viven dentro de partials/*.html, que se inyectan
// recién en loadPartials() (ver core/partials.js), DESPUÉS de que este
// módulo se importa. Por eso NO se guardan en una constante de nivel
// superior (eso los "congelaría" en null para siempre, capturados antes
// de que el HTML exista) — se consultan al vuelo, cada vez que se
// necesitan, con este helper.
function el(id) {
  return document.getElementById(id);
}

function showApp(session) {
  el('loginScreen').classList.add('hidden');
  el('appShell').classList.remove('hidden');
  const ETIQUETAS_ROL = {
    administrador: 'Administrador',
    responsable_institucional: 'Responsable institucional',
    usuario: 'Usuario'
  };

  el('sessionUsuario').textContent = session.usuario;
  el('sessionRol').textContent = ETIQUETAS_ROL[session.rol] || 'Usuario';

  // "responsable_institucional" ve todo lo que ve un Administrador (Personal,
  // Admin), más el bloque de "Borrar TODO el historial", que un Administrador
  // ya NO puede ejecutar por sí solo.
  const esAdmin = session.rol === 'administrador' || session.rol === 'responsable_institucional';
  const esResponsable = session.rol === 'responsable_institucional';

  document.querySelectorAll('[data-admin-only]').forEach(nodo => {
    nodo.classList.toggle('hidden', !esAdmin);
  });
  document.querySelectorAll('[data-responsable-only]').forEach(nodo => {
    nodo.classList.toggle('hidden', !esResponsable);
  });
  document.querySelectorAll('[data-responsable-hidden-note]').forEach(nodo => {
    nodo.classList.toggle('hidden', esResponsable);
  });
}

function showLogin() {
  el('appShell').classList.add('hidden');
  el('loginScreen').classList.remove('hidden');
}

/** Revisa si ya hay una sesión activa (cookie válida) al cargar la página. */
export async function initAuth() {
  try {
    const session = await api.get('/api/auth/me');
    showApp(session);
    return session;
  } catch {
    showLogin();
    return null;
  }
}

/** Conecta el formulario de login; `onSuccess` recibe la sesión ya iniciada. */
export function wireLoginForm(onSuccess) {
  const loginForm = el('loginForm');
  const loginError = el('loginError');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const formData = Object.fromEntries(new FormData(loginForm).entries());
    try {
      const session = await api.post('/api/auth/login', formData);
      loginForm.reset();
      showApp(session);
      onSuccess(session);
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove('hidden');
    }
  });
}

export function wireLogoutButton() {
  el('logoutBtn').addEventListener('click', async () => {
    try { await api.post('/api/auth/logout'); } catch { /* si falla, igual regresamos al login */ }
    showLogin();
  });
}
