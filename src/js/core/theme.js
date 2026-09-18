/**
 * Tema (claro/oscuro) y acento de color de la interfaz.
 *
 * Cómo funciona: styles.css define TODOS sus colores como variables CSS
 * (--bg-panel, --accent, etc.), y tiene bloques alternativos activados por
 * los atributos data-theme/data-accent en <html>. Aquí solo se leen/guardan
 * esas dos preferencias en localStorage y se aplican como atributos — el
 * cambio de color en sí lo resuelve el navegador vía CSS, no JS.
 *
 * La AUSENCIA de un guardado previo en localStorage ya está cubierta por un
 * script en línea al inicio de index.html (antes de cargar el CSS), para
 * que la preferencia guardada se vea desde el primer pintado de la página y
 * no haya un parpadeo con el tema equivocado. Este módulo solo necesita
 * conectar los botones del selector (en partials/header.html) una vez que
 * ese fragmento ya está en el DOM.
 */

const TEMA_KEY = 'cinoteca:tema';
const ACENTO_KEY = 'cinoteca:acento';
const TEMA_POR_DEFECTO = 'oscuro';
const ACENTO_POR_DEFECTO = 'dorado';

function aplicar(tema, acento) {
  if (tema === 'claro') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  document.documentElement.setAttribute('data-accent', acento);
}

function marcarControlesActivos(tema, acento) {
  document.querySelectorAll('[data-tema-btn]').forEach(btn => {
    btn.classList.toggle('is-active', btn.getAttribute('data-tema-btn') === tema);
  });
  document.querySelectorAll('[data-acento-btn]').forEach(btn => {
    btn.classList.toggle('is-active', btn.getAttribute('data-acento-btn') === acento);
  });
}

export function initTheme() {
  const tema = localStorage.getItem(TEMA_KEY) || TEMA_POR_DEFECTO;
  const acento = localStorage.getItem(ACENTO_KEY) || ACENTO_POR_DEFECTO;
  aplicar(tema, acento);
  marcarControlesActivos(tema, acento);

  document.querySelectorAll('[data-tema-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nuevoTema = btn.getAttribute('data-tema-btn');
      localStorage.setItem(TEMA_KEY, nuevoTema);
      aplicar(nuevoTema, localStorage.getItem(ACENTO_KEY) || ACENTO_POR_DEFECTO);
      marcarControlesActivos(nuevoTema, localStorage.getItem(ACENTO_KEY) || ACENTO_POR_DEFECTO);
    });
  });

  document.querySelectorAll('[data-acento-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nuevoAcento = btn.getAttribute('data-acento-btn');
      localStorage.setItem(ACENTO_KEY, nuevoAcento);
      aplicar(localStorage.getItem(TEMA_KEY) || TEMA_POR_DEFECTO, nuevoAcento);
      marcarControlesActivos(localStorage.getItem(TEMA_KEY) || TEMA_POR_DEFECTO, nuevoAcento);
    });
  });
}
