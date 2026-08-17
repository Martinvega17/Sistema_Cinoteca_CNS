import { api } from './api.js';
import { showToast } from './ui.js';

export function initAdminPanel() {
  const usuariosForm = document.getElementById('usuariosForm');
  const usuariosBody = document.getElementById('usuariosBody');
  const auditoriaBody = document.getElementById('auditoriaBody');

  function renderUsuarioRow(u) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.usuario}</td>
      <td class="capitalize">${u.rol}</td>
      <td>${u.activo
        ? '<span class="status-chip status-dentro">ACTIVO</span>'
        : '<span class="status-chip status-fuera">INACTIVO</span>'}</td>
      <td>
        <button type="button" class="btn-outline text-[11px] px-2.5 py-1 toggle-usuario-btn" data-id="${u.id}" data-activo="${u.activo}">
          ${u.activo ? 'Desactivar' : 'Reactivar'}
        </button>
      </td>
    `;
    return tr;
  }

  function renderAuditoriaRow(a) {
    const tr = document.createElement('tr');
    const fecha = new Date(a.fecha).toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    tr.innerHTML = `
      <td class="font-mono">${fecha}</td>
      <td>${a.usuario || '—'}</td>
      <td>${a.accion}</td>
      <td class="font-mono">${a.registro_afectado || '—'}</td>
    `;
    return tr;
  }

  async function cargarUsuarios() {
    try {
      const usuarios = await api.get('/api/usuarios');
      usuariosBody.innerHTML = '';
      usuarios.forEach(u => usuariosBody.appendChild(renderUsuarioRow(u)));
    } catch (err) {
      showToast(`No se pudieron cargar los usuarios: ${err.message}`);
    }
  }

  async function cargarAuditoria() {
    try {
      const entradas = await api.get('/api/auditoria');
      auditoriaBody.innerHTML = '';
      entradas.forEach(a => auditoriaBody.appendChild(renderAuditoriaRow(a)));
    } catch (err) {
      showToast(`No se pudo cargar la auditoría: ${err.message}`);
    }
  }

  usuariosForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(usuariosForm).entries());
    try {
      await api.post('/api/usuarios', fd);
      usuariosForm.reset();
      showToast('Usuario creado.', 'warning');
      cargarUsuarios();
      cargarAuditoria();
    } catch (err) {
      showToast(err.message);
    }
  });

  usuariosBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('.toggle-usuario-btn');
    if (!btn) return;
    const id = btn.dataset.id;
    const activoActual = btn.dataset.activo === 'true';
    try {
      await api.put(`/api/usuarios/${id}`, { activo: !activoActual });
      cargarUsuarios();
      cargarAuditoria();
    } catch (err) {
      showToast(err.message);
    }
  });

  cargarUsuarios();
  cargarAuditoria();
  return { cargarUsuarios, cargarAuditoria };
}
