/**
 * Exporta renglones de `accesos` (tal como los regresa GET /api/accesos,
 * incluyendo firma_entrada/firma_salida en base64) a un PDF con las firmas
 * digitales embebidas como imagen.
 *
 * Usa jsPDF cargado desde CDN en index.html como `window.jspdf.jsPDF` — no
 * es un import de módulo porque este proyecto no tiene paso de bundling
 * para dependencias de npm en el frontend (ver <script> en index.html).
 */

const MARGEN = 40;
const ANCHO_FIRMA = 90;
const ALTO_FIRMA = 34;

function agruparPorFolio(rows) {
  const orden = [];
  const grupos = new Map();
  rows.forEach(row => {
    if (!grupos.has(row.folio_grupo)) {
      grupos.set(row.folio_grupo, {
        folio_grupo: row.folio_grupo,
        motivo: row.motivo,
        acompanante: row.acompanante || null,
        fecha: row.fecha,
        personas: []
      });
      orden.push(row.folio_grupo);
    }
    grupos.get(row.folio_grupo).personas.push(row);
  });
  return orden.map(f => grupos.get(f));
}

function formatFecha(fecha) {
  if (!fecha) return '';
  return String(fecha).slice(0, 10);
}

function formatFechaHora(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '';
  }
}

/**
 * @param {Array} rows           Filas de accesos (una por persona).
 * @param {Object} opciones
 * @param {string} opciones.titulo
 * @param {string} opciones.subtitulo
 */
export function exportarAccesosPDF(rows, { titulo = 'Bitácora de Acceso a Cintoteca', subtitulo = '' } = {}) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    console.error('jsPDF no está disponible (revisa el <script> de jspdf en index.html).');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const anchoPagina = doc.internal.pageSize.getWidth();
  const altoPagina = doc.internal.pageSize.getHeight();
  let y = MARGEN;

  function nuevaPaginaSiHaceFalta(alturaNecesaria) {
    if (y + alturaNecesaria > altoPagina - MARGEN) {
      doc.addPage();
      y = MARGEN;
      dibujarEncabezadoPagina();
    }
  }

  function dibujarEncabezadoPagina() {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('IPICYT · CINTOTECA · SAN LUIS POTOSÍ, MÉX.', MARGEN, y);
    doc.setTextColor(0);
    y += 16;
  }

  // ---- Encabezado del documento ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Instituto Potosino de Investigación Científica y Tecnológica', MARGEN, y);
  y += 16;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(90);
  doc.text('CINTOTECA · SAN LUIS POTOSÍ, MÉX.', MARGEN, y);
  doc.setTextColor(0);
  y += 22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(titulo, MARGEN, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  if (subtitulo) {
    doc.text(subtitulo, MARGEN, y);
    y += 13;
  }
  doc.text(`Exportado: ${new Date().toLocaleString('es-MX')}`, MARGEN, y);
  doc.setTextColor(0);
  y += 10;

  doc.setDrawColor(200);
  doc.line(MARGEN, y, anchoPagina - MARGEN, y);
  y += 18;

  const grupos = agruparPorFolio(rows);

  if (grupos.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.text('No hay registros para estos filtros.', MARGEN, y);
  }

  grupos.forEach(grupo => {
    // Altura estimada de la tarjeta del folio: cabecera + una fila por
    // persona (cada una puede traer hasta dos firmas apiladas).
    const alturaEstimada = 34 + grupo.personas.length * (ALTO_FIRMA + 26);
    nuevaPaginaSiHaceFalta(Math.min(alturaEstimada, altoPagina - MARGEN * 2));

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(120, 90, 30);
    doc.text(`FOLIO ${grupo.folio_grupo}`, MARGEN, y);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Fecha: ${formatFecha(grupo.fecha)}`, MARGEN + 90, y);
    doc.text(`Motivo: ${grupo.motivo || '—'}`, MARGEN + 200, y);
    y += 13;
    if (grupo.acompanante) {
      doc.setFontSize(8.5);
      doc.setTextColor(90);
      doc.text(`Acompañado por: ${grupo.acompanante}`, MARGEN, y);
      doc.setTextColor(0);
      y += 12;
    }
    y += 4;

    grupo.personas.forEach(persona => {
      const alturaFila = ALTO_FIRMA + 22;
      nuevaPaginaSiHaceFalta(alturaFila);

      const xTexto = MARGEN;
      const xFirmaEntrada = anchoPagina - MARGEN - ANCHO_FIRMA * 2 - 10;
      const xFirmaSalida = anchoPagina - MARGEN - ANCHO_FIRMA;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(persona.nombre || '—', xTexto, y + 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(110);
      doc.text(persona.puesto || '', xTexto, y + 21);
      doc.setTextColor(0);
      doc.setFontSize(8.5);
      const horaEntrada = persona.hora_entrada ? String(persona.hora_entrada).slice(0, 5) : '—';
      const horaSalida = persona.hora_salida ? String(persona.hora_salida).slice(0, 5) : '— (aún dentro)';
      doc.text(`Entrada: ${horaEntrada}    Salida: ${horaSalida}`, xTexto, y + 32);

      doc.setFontSize(7);
      doc.setTextColor(110);
      doc.text('Firma entrada', xFirmaEntrada, y);
      doc.text('Firma salida', xFirmaSalida, y);
      doc.setTextColor(0);
      doc.setDrawColor(210);
      doc.rect(xFirmaEntrada, y + 3, ANCHO_FIRMA, ALTO_FIRMA);
      doc.rect(xFirmaSalida, y + 3, ANCHO_FIRMA, ALTO_FIRMA);

      if (persona.firma_entrada) {
        try {
          doc.addImage(persona.firma_entrada, 'PNG', xFirmaEntrada + 2, y + 5, ANCHO_FIRMA - 4, ALTO_FIRMA - 4, undefined, 'FAST');
        } catch { /* imagen corrupta: se deja el recuadro vacío */ }
      }
      if (persona.firma_salida) {
        try {
          doc.addImage(persona.firma_salida, 'PNG', xFirmaSalida + 2, y + 5, ANCHO_FIRMA - 4, ALTO_FIRMA - 4, undefined, 'FAST');
        } catch { /* imagen corrupta: se deja el recuadro vacío */ }
      }

      if (persona.firma_entrada_fecha) {
        doc.setFontSize(6);
        doc.setTextColor(140);
        doc.text(formatFechaHora(persona.firma_entrada_fecha), xFirmaEntrada, y + 3 + ALTO_FIRMA + 8);
        doc.setTextColor(0);
      }
      if (persona.firma_salida_fecha) {
        doc.setFontSize(6);
        doc.setTextColor(140);
        doc.text(formatFechaHora(persona.firma_salida_fecha), xFirmaSalida, y + 3 + ALTO_FIRMA + 8);
        doc.setTextColor(0);
      }

      y += alturaFila;
    });

    doc.setDrawColor(230);
    doc.line(MARGEN, y, anchoPagina - MARGEN, y);
    y += 14;
  });

  const fechaArchivo = new Date().toISOString().slice(0, 10);
  doc.save(`bitacora_cinoteca_${fechaArchivo}.pdf`);
}
