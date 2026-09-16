/**
 * Firma digital en pantalla — modal con un <canvas> donde se puede firmar
 * con el dedo (celular/tablet), con mouse (PC) o con lápiz óptico. Usa
 * Pointer Events porque es el único API que cubre los tres casos con el
 * mismo código (a diferencia de mezclar mouseXXX + touchXXX a mano).
 *
 * Uso:
 *   import { pedirFirma, verFirma } from '../core/signature-pad.js';
 *   const firma = await pedirFirma({ titulo: 'Firma de entrada', ... });
 *   if (!firma) { // la persona canceló, no continuar
 *
 * `firma` es un data URL PNG ("data:image/png;base64,...") listo para
 * guardarse tal cual en la base de datos y para insertarse en un PDF.
 */

let overlayActual = null;

function cerrarOverlay() {
  if (!overlayActual) return;
  overlayActual.remove();
  overlayActual = null;
  document.removeEventListener('keydown', onKeydown);
}

function onKeydown(e) {
  if (e.key === 'Escape') cerrarOverlay();
}

/**
 * Abre el modal de firma y regresa una Promise que resuelve con el data
 * URL PNG de la firma, o con `null` si la persona cancela.
 */
export function pedirFirma({ titulo = 'Firma digital', subtitulo = '' } = {}) {
  return new Promise((resolve) => {
    // Por seguridad, si ya había un modal de firma abierto (no debería
    // pasar, pero evita dos overlays encimados) lo cerramos primero.
    cerrarOverlay();

    const overlay = document.createElement('div');
    overlay.className = 'sig-overlay';
    overlay.innerHTML = `
      <div class="sig-modal" role="dialog" aria-modal="true" aria-label="${titulo}">
        <div class="sig-modal-header">
          <div>
            <h3 class="font-display text-sm font-semibold text-[var(--text-hi)] letter-space uppercase">${titulo}</h3>
            ${subtitulo ? `<p class="text-[11px] text-[var(--text-dim)] mt-1">${subtitulo}</p>` : ''}
          </div>
          <button type="button" class="sig-close-btn" aria-label="Cancelar">×</button>
        </div>

        <div class="sig-canvas-wrap">
          <canvas class="sig-canvas"></canvas>
          <p class="sig-canvas-placeholder">Firma aquí con el dedo, mouse o lápiz óptico</p>
        </div>

        <p id="sigError" class="hidden text-[11px] text-[var(--danger)] text-center pt-1">Debes firmar antes de continuar.</p>

        <div class="sig-modal-actions">
          <button type="button" class="btn-outline text-[12px] px-3 py-2" id="sigClear">Limpiar</button>
          <div class="flex items-center gap-2">
            <button type="button" class="btn-outline text-[12px] px-3 py-2" id="sigCancel">Cancelar</button>
            <button type="button" class="btn-primary text-[12px] px-4 py-2" id="sigConfirm">Confirmar firma</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlayActual = overlay;

    const canvas = overlay.querySelector('.sig-canvas');
    const placeholder = overlay.querySelector('.sig-canvas-placeholder');
    const errorMsg = overlay.querySelector('#sigError');
    const ctx = canvas.getContext('2d');

    let dibujando = false;
    let tieneTrazo = false;
    let lastX = 0;
    let lastY = 0;

    // El canvas se dibuja en resolución real (devicePixelRatio) para que
    // la firma no se vea pixelada en pantallas de alta densidad (la
    // mayoría de los celulares/tablets), pero las coordenadas del mouse
    // siguen siendo las del CSS — por eso se escala el contexto.
    function ajustarTamano() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      // Antes de cambiar el tamaño, guardamos el trazo ya dibujado para
      // no perderlo si el usuario rota el dispositivo a medio firmar.
      const previo = tieneTrazo ? canvas.toDataURL('image/png') : null;

      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#E9EFF5';

      if (previo) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = previo;
      }
    }

    function posDesdeEvento(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function empezarTrazo(e) {
      canvas.setPointerCapture(e.pointerId);
      dibujando = true;
      tieneTrazo = true;
      placeholder.classList.add('hidden');
      errorMsg.classList.add('hidden');
      const { x, y } = posDesdeEvento(e);
      lastX = x;
      lastY = y;
      // Un solo punto (tap) también cuenta como marca de la firma.
      ctx.beginPath();
      ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }

    function seguirTrazo(e) {
      if (!dibujando) return;
      const { x, y } = posDesdeEvento(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
      lastX = x;
      lastY = y;
      e.preventDefault();
    }

    function terminarTrazo(e) {
      if (!dibujando) return;
      dibujando = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* no-op */ }
    }

    function limpiar() {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      tieneTrazo = false;
      placeholder.classList.remove('hidden');
      errorMsg.classList.add('hidden');
    }

    canvas.style.touchAction = 'none'; // evita que el navegador haga scroll/zoom al firmar
    canvas.addEventListener('pointerdown', empezarTrazo);
    canvas.addEventListener('pointermove', seguirTrazo);
    canvas.addEventListener('pointerup', terminarTrazo);
    canvas.addEventListener('pointerleave', terminarTrazo);
    canvas.addEventListener('pointercancel', terminarTrazo);

    window.addEventListener('resize', ajustarTamano);
    // Se ejecuta tras el primer paint para que getBoundingClientRect ya
    // tenga el tamaño final del modal.
    requestAnimationFrame(ajustarTamano);

    function finalizar(valor) {
      window.removeEventListener('resize', ajustarTamano);
      cerrarOverlay();
      resolve(valor);
    }

    overlay.querySelector('#sigClear').addEventListener('click', limpiar);
    overlay.querySelector('#sigCancel').addEventListener('click', () => finalizar(null));
    overlay.querySelector('.sig-close-btn').addEventListener('click', () => finalizar(null));
    overlay.querySelector('#sigConfirm').addEventListener('click', () => {
      if (!tieneTrazo) {
        errorMsg.classList.remove('hidden');
        return;
      }
      finalizar(canvas.toDataURL('image/png'));
    });

    // El overlay NO se cierra al hacer click afuera (a diferencia de un
    // modal normal): la firma es un paso obligatorio del registro, así
    // que un click accidental fuera del panel no debe perderlo. Sí se
    // puede cancelar explícitamente con el botón × / Cancelar / Esc.
    document.addEventListener('keydown', onKeydown);
  });
}

/**
 * Muestra una firma ya guardada (solo lectura) en un modal simple, para
 * revisar firmas de entrada/salida desde "Registros de hoy" o el
 * histórico. `dataUrl` es lo que regresó `pedirFirma` (o lo que vino de
 * la base de datos en firma_entrada / firma_salida).
 */
export function verFirma({ titulo = 'Firma', dataUrl, meta = '' } = {}) {
  cerrarOverlay();
  const overlay = document.createElement('div');
  overlay.className = 'sig-overlay';
  overlay.innerHTML = `
    <div class="sig-modal sig-modal-view" role="dialog" aria-modal="true" aria-label="${titulo}">
      <div class="sig-modal-header">
        <div>
          <h3 class="font-display text-sm font-semibold text-[var(--text-hi)] letter-space uppercase">${titulo}</h3>
          ${meta ? `<p class="text-[11px] text-[var(--text-dim)] mt-1 font-mono">${meta}</p>` : ''}
        </div>
        <button type="button" class="sig-close-btn" aria-label="Cerrar">×</button>
      </div>
      <div class="sig-canvas-wrap sig-canvas-wrap-view">
        <img src="${dataUrl}" alt="${titulo}" class="sig-view-img">
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlayActual = overlay;
  document.addEventListener('keydown', onKeydown);
  overlay.querySelector('.sig-close-btn').addEventListener('click', cerrarOverlay);
}
