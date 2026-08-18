import { api } from './api.js';
import { showToast } from './ui.js';
import { todayYMD } from './validation.js';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function initReportes() {
  const form = document.getElementById('reportesForm');
  const tbody = document.getElementById('reportesBody');
  const emptyState = document.getElementById('reportesEmpty');
  const countLabel = document.getElementById('reportesCount');
  const personaFiltro = document.getElementById('reportesPersonaFiltro');
  const exportJsonBtn = document.getElementById('reportesExportJson');
  const exportCsvBtn = document.getElementById('reportesExportCsv');
  const anioTabsEl = document.getElementById('reportesAnioTabs');
  const mesTabsEl = document.getElementById('reportesMesTabs');

  const hoy = new Date();
  const anioActual = Number(todayYMD(hoy).slice(0, 4));
  const mesActual = Number(todayYMD(hoy).slice(5, 7));

  // meses con registros por año, tal como los regresa /api/accesos/meses:
  // { anios: { "2026": [{mes, total}], "2025": [...] } }
  let mesesPorAnio = {};
  let anioSeleccionado = anioActual;
  let mesSeleccionado = mesActual;

  function ultimoDiaDeMes(anio, mes) {
    return new Date(anio, mes, 0).getDate();
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  // ---------------------------------------------------------------------
  // Pestañas de AÑO y MES
  // ---------------------------------------------------------------------
  // Solo se muestran años/meses que ya tienen registros, más el año/mes
  // actual aunque todavía no tenga ninguno (así, si estamos en agosto y no
  // hubo registros en meses previos, solo aparece "Agosto"; al llegar
  // enero del año siguiente, los meses del año anterior ya no se listan
  // aquí y todo vuelve a empezar desde enero).
  function aniosDisponibles() {
    const anios = new Set(Object.keys(mesesPorAnio).map(Number));
    anios.add(anioActual);
    return [...anios].sort((a, b) => b - a);
  }

  function mesesDisponibles(anio) {
    const meses = new Set((mesesPorAnio[anio] || []).map(m => m.mes));
    if (anio === anioActual) meses.add(mesActual);
    return [...meses].sort((a, b) => a - b);
  }

  function renderAnioTabs() {
    anioTabsEl.innerHTML = '';
    aniosDisponibles().forEach(anio => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'year-tab' + (anio === anioSeleccionado ? ' active' : '');
      btn.textContent = anio;
      btn.addEventListener('click', () => {
        anioSeleccionado = anio;
        const disponibles = mesesDisponibles(anio);
        if (!disponibles.includes(mesSeleccionado)) {
          mesSeleccionado = anio === anioActual ? mesActual : disponibles[disponibles.length - 1];
        }
        renderAnioTabs();
        renderMesTabs();
        aplicarFiltroMes();
      });
      anioTabsEl.appendChild(btn);
    });
  }

  function renderMesTabs() {
    mesTabsEl.innerHTML = '';
    mesesDisponibles(anioSeleccionado).forEach(mes => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'month-tab' + (mes === mesSeleccionado ? ' active' : '');
      btn.textContent = MESES[mes - 1];
      btn.addEventListener('click', () => {
        mesSeleccionado = mes;
        renderMesTabs();
        aplicarFiltroMes();
      });
      mesTabsEl.appendChild(btn);
    });
  }

  function aplicarFiltroMes() {
    const desde = `${anioSeleccionado}-${pad2(mesSeleccionado)}-01`;
    const esMesActual = anioSeleccionado === anioActual && mesSeleccionado === mesActual;
    const hasta = esMesActual
      ? todayYMD(hoy)
      : `${anioSeleccionado}-${pad2(mesSeleccionado)}-${pad2(ultimoDiaDeMes(anioSeleccionado, mesSeleccionado))}`;
    form.querySelector('input[name="desde"]').value = desde;
    form.querySelector('input[name="hasta"]').value = hasta;
    buscar();
  }

  async function cargarMeses() {
    try {
      const data = await api.get('/api/accesos/meses');
      mesesPorAnio = data.anios || {};
    } catch {
      mesesPorAnio = {}; // las pestañas son un extra; si falla, el buscador manual sigue funcionando
    }
    renderAnioTabs();
    renderMesTabs();
  }

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

  // Una búsqueda manual (fechas / persona / motivo escritos a mano) ya no
  // corresponde necesariamente a un mes completo, así que se quita el
  // resaltado de las pestañas de mes/año para no dar información falsa.
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    document.querySelectorAll('#reportesAnioTabs .active, #reportesMesTabs .active')
      .forEach(el => el.classList.remove('active'));
    buscar();
  });

  exportJsonBtn.addEventListener('click', () => {
    window.location.href = `/api/exportar/json?${currentQuery()}`;
  });
  exportCsvBtn.addEventListener('click', () => {
    window.location.href = `/api/exportar/csv?${currentQuery()}`;
  });

  cargarPersonasFiltro();
  cargarMeses().then(aplicarFiltroMes);

  return { buscar };
}
