import { api } from '../core/api.js';
import { showToast } from '../core/ui.js';

const ETIQUETAS_ROL = {
  usuario: 'Usuario',
  administrador: 'Administrador',
  responsable_institucional: 'Responsable institucional'
};

export function initAdminPanel({ onLimpiarHoy, onBorrarTodo } = {}) {
  const usuariosForm = document.getElementById('usuariosForm');
  const usuariosBody = document.getElementById('usuariosBody');
  const auditoriaBody = document.getElementById('auditoriaBody');
  const limpiarHoyBtn = document.getElementById('limpiarHoyBtn');
  const borrarTodoBtn = document.getElementById('borrarTodoBtn');

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
            <option value="responsable_institucional" ${u.rol === 'responsable_institucional' ? 'selected' : ''}>Responsable institucional</option>
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
      <td>${ETIQUETAS_ROL[u.rol] || u.rol}</td>
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

  limpiarHoyBtn.addEventListener('click', async () => {
    const confirmado = window.confirm(
      'Esto va a borrar TODOS los registros de hoy y reiniciar el folio a 001. No se puede deshacer. ¿Continuar?'
    );
    if (!confirmado) return;

    limpiarHoyBtn.disabled = true;
    try {
      const resultado = await api.delete('/api/accesos');
      showToast(
        resultado.eliminados
          ? `${resultado.eliminados} registro(s) de hoy eliminados. Folio reiniciado a 001.`
          : 'No había registros de hoy que eliminar. Folio reiniciado a 001.',
        'warning'
      );
      cargarAuditoria();
      if (onLimpiarHoy) onLimpiarHoy();
    } catch (err) {
      showToast(err.message);
    } finally {
      limpiarHoyBtn.disabled = false;
    }
  });

  // Controles para "Borrar TODO el historial" (ver FA-PT-0002 §8 y Manual
  // de Administrador §3.6):
  //   1. Solo la ve/puede accionar una cuenta "responsable_institucional"
  //      (el botón está oculto para Administrador — ver data-responsable-only
  //      en auth.js).
  //   2. Doble confirmación local (confirm + escribir "BORRAR").
  //   3. Doble AUTORIZACIÓN real: se pide usuario y contraseña de una
  //      segunda cuenta (Administrador o Responsable institucional,
  //      distinta de la que inició sesión), que el servidor valida antes
  //      de borrar. Sin esto, el servidor rechaza la solicitud aunque el
  //      rol sea el correcto.
  //   4. El servidor guarda automáticamente un respaldo completo de los
  //      registros antes de borrarlos (respaldos_eliminacion) — no depende
  //      de que alguien haya exportado manualmente ese día.
  borrarTodoBtn.addEventListener('click', async () => {
    const primeraConfirmacion = window.confirm(
      'Esto va a borrar TODO el historial de accesos (de cualquier fecha, no solo hoy) y reiniciar el folio a 001. No se puede deshacer. ¿Continuar?'
    );
    if (!primeraConfirmacion) return;

    const texto = window.prompt('Para confirmar, escribe BORRAR en mayúsculas:');
    if (texto !== 'BORRAR') {
      showToast('Cancelado: no escribiste "BORRAR" tal cual.');
      return;
    }

    const segundoUsuario = window.prompt(
      'Autorización requerida: escribe el nombre de USUARIO de un segundo Administrador o Responsable institucional (una cuenta distinta a la tuya).'
    );
    if (!segundoUsuario) {
      showToast('Cancelado: se requiere un segundo usuario que autorice.');
      return;
    }
    const segundoPassword = window.prompt(`Contraseña de "${segundoUsuario}" para autorizar el borrado:`);
    if (!segundoPassword) {
      showToast('Cancelado: se requiere la contraseña del segundo usuario.');
      return;
    }

    borrarTodoBtn.disabled = true;
    try {
      const resultado = await api.delete('/api/accesos?todo=true', { segundoUsuario, segundoPassword });
      showToast(
        resultado.eliminados
          ? `${resultado.eliminados} registro(s) eliminados de TODO el historial (respaldados automáticamente). Folio reiniciado a 001.`
          : 'No había registros que eliminar. Folio reiniciado a 001.',
        'warning'
      );
      cargarAuditoria();
      if (onBorrarTodo) onBorrarTodo();
    } catch (err) {
      showToast(err.message);
    } finally {
      borrarTodoBtn.disabled = false;
    }
  });

  cargarUsuarios();
  cargarAuditoria();
  return { cargarUsuarios, cargarAuditoria };
}
