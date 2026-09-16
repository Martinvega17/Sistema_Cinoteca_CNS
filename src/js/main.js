import { initClock } from './core/clock.js';
import { initAuth, wireLoginForm, wireLogoutButton } from './core/auth.js';
import { initTabs } from './core/tabs.js';
import { initMultiselect } from './user/multiselect.js';
import { initQuickVisits } from './user/quickvisits.js';
import { initRecords } from './user/records.js';
import { initReportes } from './user/reportes.js';
import { initPersonalAdmin } from './admin/personal-admin.js';
import { initAdminPanel } from './admin/admin.js';

initClock();
initTabs();
wireLogoutButton();

let started = false;

async function start(session) {
  if (started) return; // evita inicializar dos veces si hay un doble login
  started = true;

  // quickVisits se crea primero para poder pasarle a initMultiselect un
  // callback: cada vez que cambia la selección de "Personas que ingresan",
  // quickVisits sabe cuántas hay y decide si todavía hace falta pedir
  // "Acompañado por" a mano (ver quickvisits.js).
  const quickVisits = initQuickVisits();
  const multiselect = await initMultiselect((seleccionadas) => {
    quickVisits.actualizarPersonasSeleccionadas(seleccionadas.length);
  });
  const records = initRecords(multiselect, quickVisits);
  const reportes = initReportes();

  if (session.rol === 'administrador' || session.rol === 'responsable_institucional') {
    initPersonalAdmin();
    initAdminPanel({
      onLimpiarHoy: () => {
        records.loadToday();
        reportes.buscar();
      },
      onBorrarTodo: () => {
        records.loadToday();
        reportes.buscar();
      }
    });
  }
}

const session = await initAuth();
// El formulario de login se conecta SIEMPRE, sin importar si ya había una
// sesión activa al cargar la página. Antes solo se conectaba en el rama
// "sin sesión" de abajo: si la página cargaba con sesión activa y luego el
// usuario cerraba sesión (logout es solo un cambio de pantalla, sin
// recargar la página), el formulario de login se quedaba SIN su listener
// de "submit" para el resto de esa pestaña del navegador. Al intentar
// entrar con otro usuario, el navegador hacía un envío nativo del <form>
// (sin método/acción definidos = GET a la URL actual), lo que dejaba
// "?usuario=...&password=..." pegado en la URL y recargaba la página sin
// iniciar sesión — de ahí que solo funcionara tras borrar eso de la URL y
// recargar (esa recarga sí carga sin sesión y sí conecta el formulario).
wireLoginForm(start);
if (session) {
  start(session);
}
