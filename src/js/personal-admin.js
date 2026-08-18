import { api } from './api.js';
import { showToast } from './ui.js';

export function initPersonalAdmin() {
  const form = document.getElementById('personalForm');
  const tbody = document.getElementById('personalBody');
  const toggleInactivos = document.getElementById('personalMostrarInactivos');

  let personasCache = [];
  let editandoId = null;

  function escapeAttr(str) {
    return String(str ?? '').replace(/"/g, '&quot;');
  }

  function renderRow(p) {
    const tr = document.createElement('tr');

    if (editandoId === p.id) {
      tr.innerHTML = `
        <td><input class="inline-edit-input" name="nombre" value="${escapeAttr(p.nombre)}" required></td>
        <td><input class="inline-edit-input" name="area" value="${escapeAttr(p.area)}"></td>
        <td><input class="inline-edit-input" name="puesto" value="${escapeAttr(p.puesto)}" required></td>
        <td>${p.activo
          ? '<span class="status-chip status-dentro">ACTIVO</span>'
          : '<span class="status-chip status-fuera">BAJA</span>'}</td>
        <td class="whitespace-nowrap">
          <button type="button" class="btn-primary text-[11px] px-2.5 py-1 guardar-persona-btn" data-id="${p.id}">Guardar</button>
          <button type="button" class="btn-outline text-[11px] px-2.5 py-1 cancelar-persona-btn" data-id="${p.id}">Cancelar</button>
        </td>
      `;
      return tr;
    }

    tr.innerHTML = `
      <td>${p.nombre}${p.es_visita ? ' <span class="visita-badge">Visita</span>' : ''}</td>
      <td>${p.area || '—'}</td>
      <td>${p.puesto}</td>
      <td>${p.activo
        ? '<span class="status-chip status-dentro">ACTIVO</span>'
        : '<span class="status-chip status-fuera">BAJA</span>'}</td>
      <td class="whitespace-nowrap">
        <button type="button" class="btn-outline text-[11px] px-2.5 py-1 editar-persona-btn" data-id="${p.id}">Editar</button>
        <button type="button" class="btn-outline text-[11px] px-2.5 py-1 toggle-activo-btn" data-id="${p.id}" data-activo="${p.activo}">
          ${p.activo ? 'Dar de baja' : 'Reactivar'}
        </button>
      </td>
    `;
    return tr;
  }

  function repintar() {
    tbody.innerHTML = '';
    personasCache.forEach(p => tbody.appendChild(renderRow(p)));
  }

  async function cargar() {
    try {
      personasCache = await api.get(`/api/personas?activos=${toggleInactivos.checked ? 'false' : 'true'}`);
      if (editandoId !== null && !personasCache.some(p => p.id === editandoId)) editandoId = null;
      repintar();
    } catch (err) {
      showToast(`No se pudo cargar el personal: ${err.message}`);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form).entries());
    if (!fd.nombre || !fd.puesto) return;
    try {
      await api.post('/api/personas', fd);
      form.reset();
      showToast('Persona agregada al directorio.', 'warning');
      cargar();
    } catch (err) {
      showToast(err.message);
    }
  });

  tbody.addEventListener('click', async (e) => {
    const toggleBtn = e.target.closest('.toggle-activo-btn');
    if (toggleBtn) {
      const id = Number(toggleBtn.dataset.id);
      const activoActual = toggleBtn.dataset.activo === 'true';
      try {
        // Nunca se borra a la persona — solo se marca activo:false, para
        // conservar su historial de accesos.
        await api.put(`/api/personas/${id}`, { activo: !activoActual });
        cargar();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    const editarBtn = e.target.closest('.editar-persona-btn');
    if (editarBtn) {
      editandoId = Number(editarBtn.dataset.id);
      repintar();
      return;
    }

    const cancelarBtn = e.target.closest('.cancelar-persona-btn');
    if (cancelarBtn) {
      editandoId = null;
      repintar();
      return;
    }

    const guardarBtn = e.target.closest('.guardar-persona-btn');
    if (guardarBtn) {
      const id = Number(guardarBtn.dataset.id);
      const row = guardarBtn.closest('tr');
      const nombre = row.querySelector('input[name="nombre"]').value.trim();
      const area = row.querySelector('input[name="area"]').value.trim();
      const puesto = row.querySelector('input[name="puesto"]').value.trim();
      if (!nombre || !puesto) {
        showToast('Nombre y puesto son obligatorios.');
        return;
      }
      try {
        await api.put(`/api/personas/${id}`, { nombre, area, puesto });
        editandoId = null;
        showToast('Persona actualizada.', 'warning');
        cargar();
      } catch (err) {
        showToast(err.message);
      }
    }
  });

  toggleInactivos.addEventListener('change', cargar);

  cargar();
  return { cargar };
}
