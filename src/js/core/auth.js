import { api } from './api.js';

const loginScreen = document.getElementById('loginScreen');
const appShell = document.getElementById('appShell');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

function showApp(session) {
  loginScreen.classList.add('hidden');
  appShell.classList.remove('hidden');
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
  appShell.classList.add('hidden');
  loginScreen.classList.remove('hidden');
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
