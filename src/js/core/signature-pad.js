/**
 * Firma digital en pantalla — modal con un <canvas> donde se puede firmar
 * con el dedo (celular/tablet), con mouse (PC) o con lápiz óptico.
 *
 * El trazo lo maneja la librería signature_pad (cargada desde CDN en
 * index.html como `window.SignaturePad`, igual que jsPDF) en vez de un
 * dibujo a mano sobre el canvas: da curvas suaves con ancho variable
 * (en vez de una línea de grosor fijo) y ya trae resuelto lo fino de
 * mouse+touch+lápiz óptico en un solo motor, probado en producción por
 * mucha gente — más profesional que reinventarlo aquí.
 *
 * Uso:
 *   import { pedirFirma, verFirma } from '../core/signature-pad.js';
 *   const firma = await pedirFirma({ titulo: 'Firma de entrada', ... });
 *   if (!firma) { // la persona canceló, no continuar
 *
 * `firma` es un data URL PNG ("data:image/png;base64,...") listo para
 * guardarse tal cual en la base de datos y para insertarse en un PDF —
 * exactamente igual que antes, no cambia nada para quien use este módulo.
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

    if (!window.SignaturePad) {
      // No debería pasar en producción (el <script> está en index.html),
      // pero si el CDN no cargó, mejor avisar en consola que dejar el
      // modal abierto sin poder firmar.
      console.error('SignaturePad no está disponible (revisa el <script> de signature_pad en index.html).');
      overlay.remove();
      overlayActual = null;
      resolve(null);
      return;
    }

    // Fondo transparente (igual que el canvas de antes): el PNG resultante
    // debe poder colocarse sobre cualquier fondo (bitácora en PDF, vista
    // de solo lectura) sin traer un rectángulo blanco propio. El blanco
    // que se ve mientras se firma es el de `.sig-canvas-wrap` en CSS.
    const signaturePad = new window.SignaturePad(canvas, {
      minWidth: 1.2,
      maxWidth: 2.6,
      penColor: '#000000',
      backgroundColor: 'rgba(0,0,0,0)'
    });

    // El canvas se redimensiona en resolución real (devicePixelRatio) para
    // que la firma no se vea pixelada en pantallas de alta densidad (la
    // mayoría de los celulares/tablets). Antes de cambiar el tamaño se
    // guarda el trazo como datos vectoriales (signaturePad.toData()) y se
    // vuelve a dibujar después — así no se pierde ni se ve borroso si la
    // persona rota el dispositivo a medio firmar.
    function ajustarTamano() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const datosPrevios = signaturePad.isEmpty() ? null : signaturePad.toData();

      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.getContext('2d').scale(dpr, dpr);

      signaturePad.clear();
      if (datosPrevios) signaturePad.fromData(datosPrevios);
    }

    signaturePad.addEventListener('beginStroke', () => {
      placeholder.classList.add('hidden');
      errorMsg.classList.add('hidden');
    });

    window.addEventListener('resize', ajustarTamano);
    // Se ejecuta tras el primer paint para que getBoundingClientRect ya
    // tenga el tamaño final del modal.
    requestAnimationFrame(ajustarTamano);

    function finalizar(valor) {
      window.removeEventListener('resize', ajustarTamano);
      signaturePad.off();
      cerrarOverlay();
      resolve(valor);
    }

    overlay.querySelector('#sigClear').addEventListener('click', () => {
      signaturePad.clear();
      placeholder.classList.remove('hidden');
      errorMsg.classList.add('hidden');
    });
    overlay.querySelector('#sigCancel').addEventListener('click', () => finalizar(null));
    overlay.querySelector('.sig-close-btn').addEventListener('click', () => finalizar(null));
    overlay.querySelector('#sigConfirm').addEventListener('click', () => {
      if (signaturePad.isEmpty()) {
        errorMsg.classList.remove('hidden');
        return;
      }
      finalizar(signaturePad.toDataURL('image/png'));
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
