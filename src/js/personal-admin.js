import { api } from './api.js';
import { showToast } from './ui.js';

export function initPersonalAdmin() {
  const form = document.getElementById('personalForm');
  const tbody = document.getElementById('personalBody');
  const toggleInactivos = document.getElementById('personalMostrarInactivos');

  function renderRow(p) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.nombre}</td>
      <td>${p.area || '—'}</td>
      <td>${p.puesto}</td>
      <td>${p.activo
        ? '<span class="status-chip status-dentro">ACTIVO</span>'
        : '<span class="status-chip status-fuera">BAJA</span>'}</td>
      <td>
        <button type="button" class="btn-outline text-[11px] px-2.5 py-1 toggle-activo-btn" data-id="${p.id}" data-activo="${p.activo}">
          ${p.activo ? 'Dar de baja' : 'Reactivar'}
        </button>
      </td>
    `;
    return tr;
  }

  async function cargar() {
    try {
      const personas = await api.get(`/api/personas?activos=${toggleInactivos.checked ? 'false' : 'true'}`);
      tbody.innerHTML = '';
      personas.forEach(p => tbody.appendChild(renderRow(p)));
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
    const btn = e.target.closest('.toggle-activo-btn');
    if (!btn) return;
    const id = btn.dataset.id;
    const activoActual = btn.dataset.activo === 'true';
    try {
      // Nunca se borra a la persona — solo se marca activo:false, para
      // conservar su historial de accesos.
      await api.put(`/api/personas/${id}`, { activo: !activoActual });
      cargar();
    } catch (err) {
      showToast(err.message);
    }
  });

  toggleInactivos.addEventListener('change', cargar);

  cargar();
  return { cargar };
}
