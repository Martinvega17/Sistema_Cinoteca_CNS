import { api } from './api.js';
import { showToast } from './ui.js';

export function initReportes() {
  const form = document.getElementById('reportesForm');
  const tbody = document.getElementById('reportesBody');
  const emptyState = document.getElementById('reportesEmpty');
  const countLabel = document.getElementById('reportesCount');
  const personaFiltro = document.getElementById('reportesPersonaFiltro');
  const exportJsonBtn = document.getElementById('reportesExportJson');
  const exportCsvBtn = document.getElementById('reportesExportCsv');

  function currentQuery() {
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(form).entries()) {
      if (v) params.set(k, v);
    }
    return params.toString();
  }

  function renderRow(r) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="no-badge">${r.folio_grupo}</td>
      <td>${r.nombre}<div class="lc-person-puesto">${r.puesto}</div></td>
      <td class="font-mono">${String(r.fecha).slice(0, 10)}</td>
      <td class="font-mono">${r.hora_entrada ? r.hora_entrada.slice(0, 5) : '—'}</td>
      <td class="font-mono">${r.hora_salida ? r.hora_salida.slice(0, 5) : '—'}</td>
      <td>${r.motivo}</td>
    `;
    return tr;
  }

  async function buscar(e) {
    if (e) e.preventDefault();
    try {
      const rows = await api.get(`/api/accesos?${currentQuery()}`);
      tbody.innerHTML = '';
      rows.forEach(r => tbody.appendChild(renderRow(r)));
      countLabel.textContent = rows.length + (rows.length === 1 ? ' resultado' : ' resultados');
      emptyState.style.display = rows.length ? 'none' : 'block';
    } catch (err) {
      showToast(`No se pudo buscar: ${err.message}`);
    }
  }

  async function cargarPersonasFiltro() {
    try {
      const personas = await api.get('/api/personas?activos=false');
      personas.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.nombre + (p.activo ? '' : ' (baja)');
        personaFiltro.appendChild(opt);
      });
    } catch {
      // el filtro de personas es un extra; si falla, la búsqueda por fecha sigue funcionando
    }
  }

  form.addEventListener('submit', buscar);
  exportJsonBtn.addEventListener('click', () => {
    window.location.href = `/api/exportar/json?${currentQuery()}`;
  });
  exportCsvBtn.addEventListener('click', () => {
    window.location.href = `/api/exportar/csv?${currentQuery()}`;
  });

  // Carga inicial: del primer día del mes actual a hoy
  const hoy = new Date();
  const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  form.querySelector('input[name="desde"]').value = primerDiaMes.toISOString().slice(0, 10);
  form.querySelector('input[name="hasta"]').value = hoy.toISOString().slice(0, 10);

  cargarPersonasFiltro();
  buscar();

  return { buscar };
}
