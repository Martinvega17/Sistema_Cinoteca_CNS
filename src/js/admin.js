import { api } from './api.js';
import { showToast } from './ui.js';

export function initAdminPanel() {
  const usuariosForm = document.getElementById('usuariosForm');
  const usuariosBody = document.getElementById('usuariosBody');
  const auditoriaBody = document.getElementById('auditoriaBody');

  let usuariosCache = [];
  let editandoId = null;

  function renderUsuarioRow(u) {
    const tr = document.createElement('tr');

    if (editandoId === u.id) {
      tr.innerHTML = `
        <td>${u.usuario}</td>
        <td>
          <select class="inline-edit-input" name="rol">
            <option value="usuario" ${u.rol === 'usuario' ? 'selected' : ''}>Usuario</option>
            <option value="administrador" ${u.rol === 'administrador' ? 'selected' : ''}>Administrador</option>
          </select>
        </td>
        <td>
          <input class="inline-edit-input" type="password" name="password" placeholder="Nueva contraseña (opcional)">
        </td>
        <td class="whitespace-nowrap">
          <button type="button" class="btn-primary text-[11px] px-2.5 py-1 guardar-usuario-btn" data-id="${u.id}">Guardar</button>
          <button type="button" class="btn-outline text-[11px] px-2.5 py-1 cancelar-usuario-btn" data-id="${u.id}">Cancelar</button>
        </td>
      `;
      return tr;
    }

    tr.innerHTML = `
      <td>${u.usuario}</td>
      <td class="capitalize">${u.rol}</td>
      <td>${u.activo
        ? '<span class="status-chip status-dentro">ACTIVO</span>'
        : '<span class="status-chip status-fuera">INACTIVO</span>'}</td>
      <td class="whitespace-nowrap">
        <button type="button" class="btn-outline text-[11px] px-2.5 py-1 editar-usuario-btn" data-id="${u.id}">Editar</button>
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

  function repintarUsuarios() {
    usuariosBody.innerHTML = '';
    usuariosCache.forEach(u => usuariosBody.appendChild(renderUsuarioRow(u)));
  }

  async function cargarUsuarios() {
    try {
      usuariosCache = await api.get('/api/usuarios');
      if (editandoId !== null && !usuariosCache.some(u => u.id === editandoId)) editandoId = null;
      repintarUsuarios();
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
    const toggleBtn = e.target.closest('.toggle-usuario-btn');
    if (toggleBtn) {
      const id = Number(toggleBtn.dataset.id);
      const activoActual = toggleBtn.dataset.activo === 'true';
      try {
        await api.put(`/api/usuarios/${id}`, { activo: !activoActual });
        cargarUsuarios();
        cargarAuditoria();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    const editarBtn = e.target.closest('.editar-usuario-btn');
    if (editarBtn) {
      editandoId = Number(editarBtn.dataset.id);
      repintarUsuarios();
      return;
    }

    const cancelarBtn = e.target.closest('.cancelar-usuario-btn');
    if (cancelarBtn) {
      editandoId = null;
      repintarUsuarios();
      return;
    }

    const guardarBtn = e.target.closest('.guardar-usuario-btn');
    if (guardarBtn) {
      const id = Number(guardarBtn.dataset.id);
      const row = guardarBtn.closest('tr');
      const rol = row.querySelector('select[name="rol"]').value;
      const password = row.querySelector('input[name="password"]').value;
      const payload = { rol };
      if (password) payload.password = password;
      try {
        await api.put(`/api/usuarios/${id}`, payload);
        editandoId = null;
        showToast('Usuario actualizado.', 'warning');
        cargarUsuarios();
        cargarAuditoria();
      } catch (err) {
        showToast(err.message);
      }
    }
  });

  cargarUsuarios();
  cargarAuditoria();
  return { cargarUsuarios, cargarAuditoria };
}
