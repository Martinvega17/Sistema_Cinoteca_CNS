import { api } from './api.js';

// OJO: estos elementos NO se buscan aquí arriba (nivel de módulo) como
// antes — desde que el login y el header viven en partials/ (ver
// partials.js), auth.js se importa e inicializa ANTES de que
// loadPartials() inyecte ese HTML. Un `const x = document.getElementById(...)`
// a nivel de módulo se ejecuta en cuanto se importa el archivo y se queda
// con `null` para siempre, aunque el elemento aparezca después — por eso
// cada función busca el suyo en el momento en que realmente se necesita
// (ya con los partials cargados).
function elLoginScreen() { return document.getElementById('loginScreen'); }
function elAppShell() { return document.getElementById('appShell'); }
function elLoginForm() { return document.getElementById('loginForm'); }
function elLoginError() { return document.getElementById('loginError'); }

function showApp(session) {
  elLoginScreen().classList.add('hidden');
  elAppShell().classList.remove('hidden');
  const ETIQUETAS_ROL = {
    administrador: 'Administrador',
    responsable_institucional: 'Responsable institucional',
    usuario: 'Usuario'
  };

  document.getElementById('sessionUsuario').textContent = session.usuario;
  document.getElementById('sessionRol').textContent = ETIQUETAS_ROL[session.rol] || 'Usuario';

  // "responsable_institucional" ve todo lo que ve un Administrador (Personal,
  // Admin), más el bloque de "Borrar TODO el historial", que un Administrador
  // ya NO puede ejecutar por sí solo.
  const esAdmin = session.rol === 'administrador' || session.rol === 'responsable_institucional';
  const esResponsable = session.rol === 'responsable_institucional';

  document.querySelectorAll('[data-admin-only]').forEach(el => {
    el.classList.toggle('hidden', !esAdmin);
  });
  document.querySelectorAll('[data-responsable-only]').forEach(el => {
    el.classList.toggle('hidden', !esResponsable);
  });
  document.querySelectorAll('[data-responsable-hidden-note]').forEach(el => {
    el.classList.toggle('hidden', esResponsable);
  });
}

function showLogin() {
  elAppShell().classList.add('hidden');
  elLoginScreen().classList.remove('hidden');
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
  const loginForm = elLoginForm();
  const loginError = elLoginError();
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
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await api.post('/api/auth/logout'); } catch { /* si falla, igual regresamos al login */ }
    showLogin();
  });
}
