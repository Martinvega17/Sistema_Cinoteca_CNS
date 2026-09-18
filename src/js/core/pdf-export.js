/**
 * Exporta renglones de `accesos` (tal como los regresa GET /api/accesos,
 * incluyendo firma_entrada/firma_salida en base64) a un PDF con formato de
 * tabla tipo documento oficial: encabezado con logo, título centrado,
 * dateline a la derecha, tabla con cabecera azul marino (No. / Nombre de
 * la persona que ingresa / Hora de entrada / Hora de salida / Puesto o
 * cargo / Motivo de acceso / Firma) y las firmas de entrada/salida una al
 * lado de la otra dentro de la misma columna.
 *
 * Usa jsPDF cargado desde CDN en index.html como `window.jspdf.jsPDF` — no
 * es un import de módulo porque este proyecto no tiene paso de bundling
 * para dependencias de npm en el frontend (ver <script> en index.html).
 */

import { LOGO_CNS_PNG_BASE64 } from './logo-cns-base64.js';

const MARGEN = 36;
const ALTO_FIRMA = 30;
const ALTO_FILA_MIN = 58;
const ALTO_ENCABEZADO_TABLA = 26;
const ALTO_LINEA_TEXTO = 10;

// Colores del documento (RGB), estilo reporte institucional.
const COLOR_NAVY = [33, 58, 97];
const COLOR_NAVY_TEXTO = [33, 58, 97];
const COLOR_TEXTO = [20, 20, 20];
const COLOR_TEXTO_TENUE = [90, 90, 90];
const COLOR_BORDE = [190, 190, 190];
const COLOR_ZEBRA = [242, 244, 248];

const MESES = ['Ene.', 'Feb.', 'Mar.', 'Abr.', 'May.', 'Jun.', 'Jul.', 'Ago.', 'Sep.', 'Oct.', 'Nov.', 'Dic.'];

const ENCABEZADOS = ['No.', 'Nombre de la persona que ingresa', 'Hora de entrada', 'Hora de salida', 'Puesto o cargo', 'Motivo de acceso', 'Firma'];
const ANCHOS = [34, 140, 58, 58, 118, 130, 182];
const LOGO_ANCHO = 48;
const LOGO_ALTO = 48 * (110 / 306);

function formatFechaCorta(fecha) {
  if (!fecha) return '';
  return String(fecha).slice(0, 10);
}

function fechaLinea(date = new Date()) {
  return `San Luis Potosí, S.L.P. ${MESES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// Orden cronológico (más reciente primero), igual que la pantalla de
// "Registros de hoy": lo último capturado queda arriba de la bitácora.
function ordenarRows(rows) {
  return [...rows].sort((a, b) => {
    const fa = `${a.fecha} ${a.hora_entrada || ''}`;
    const fb = `${b.fecha} ${b.hora_entrada || ''}`;
    if (fa !== fb) return fa < fb ? 1 : -1;
    // Dentro del mismo folio (mismo momento de entrada), se respeta el
    // orden en que se agregaron al formulario.
    return (a.id || 0) - (b.id || 0);
  });
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
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const altoPagina = doc.internal.pageSize.getHeight();
  const anchoTabla = ANCHOS.reduce((a, b) => a + b, 0);
  let y = MARGEN;

  function xColumna(indice) {
    let x = MARGEN;
    for (let i = 0; i < indice; i++) x += ANCHOS[i];
    return x;
  }

  function dibujarEncabezadoDocumento() {
    const xTexto = MARGEN + LOGO_ANCHO + 12;
    try {
      doc.addImage(LOGO_CNS_PNG_BASE64, 'PNG', MARGEN, y - 2, LOGO_ANCHO, LOGO_ALTO, undefined, 'FAST');
    } catch { /* si el logo no carga, se omite sin romper el PDF */ }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...COLOR_TEXTO);
    doc.text('INSTITUTO POTOSINO DE INVESTIGACIÓN CIENTÍFICA Y TECNOLÓGICA A.C.', xTexto, y + 10);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR_NAVY_TEXTO);
    doc.text('CINTOTECA · SAN LUIS POTOSÍ, MÉX.', xTexto, y + 22);

    // Bloque de fecha/periodo, alineado a la derecha de la tabla.
    const xDer = MARGEN + anchoTabla;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_TEXTO_TENUE);
    doc.text(fechaLinea(), xDer, y + 4, { align: 'right' });
    if (subtitulo) {
      doc.text(subtitulo, xDer, y + 16, { align: 'right' });
    }
    doc.text(`Exportado: ${new Date().toLocaleString('es-MX')}`, xDer, y + 28, { align: 'right' });

    y += Math.max(LOGO_ALTO, 34) + 14;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...COLOR_TEXTO);
    doc.text(titulo.toUpperCase(), MARGEN + anchoTabla / 2, y, { align: 'center' });
    y += 16;

    doc.setDrawColor(...COLOR_NAVY);
    doc.setLineWidth(1.6);
    doc.line(MARGEN, y, MARGEN + anchoTabla, y);
    doc.setLineWidth(0.5);
    y += 16;
  }

  function dibujarEncabezadoTabla() {
    doc.setDrawColor(...COLOR_NAVY);
    doc.setLineWidth(0.75);
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(MARGEN, y, anchoTabla, ALTO_ENCABEZADO_TABLA, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    ENCABEZADOS.forEach((texto, i) => {
      const x = xColumna(i);
      if (i > 0) {
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.5);
        doc.line(x, y + 4, x, y + ALTO_ENCABEZADO_TABLA - 4);
      }
      const lineas = doc.splitTextToSize(texto, ANCHOS[i] - 8);
      doc.text(lineas, x + ANCHOS[i] / 2, y + ALTO_ENCABEZADO_TABLA / 2 - ((lineas.length - 1) * 4.5) + 2, { align: 'center' });
    });
    doc.setTextColor(...COLOR_TEXTO);
    y += ALTO_ENCABEZADO_TABLA;
  }

  function nuevaPaginaSiHaceFalta(alturaNecesaria) {
    if (y + alturaNecesaria > altoPagina - MARGEN) {
      doc.addPage();
      y = MARGEN;
      dibujarEncabezadoTabla();
    }
  }

  function calcularAlturaFila(fila) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const lineasNombre = doc.splitTextToSize(String(fila.nombre || '—'), ANCHOS[1] - 10);
    const lineasPuesto = doc.splitTextToSize(String(fila.puesto || ''), ANCHOS[4] - 10);
    const lineasMotivo = doc.splitTextToSize(String(fila.motivo || ''), ANCHOS[5] - 10);
    const maxLineas = Math.max(lineasNombre.length, lineasPuesto.length, lineasMotivo.length);
    return Math.max(ALTO_FILA_MIN, 20 + maxLineas * ALTO_LINEA_TEXTO);
  }

  function celdaFirma(x, anchoCol, fila, alturaFila) {
    const anchoSub = (anchoCol - 18) / 2;
    const xEntrada = x + 6;
    const xSalida = x + 12 + anchoSub;
    const yEtiqueta = fila.y + 12;
    const yBox = fila.y + 15;
    const alturaBox = Math.min(ALTO_FIRMA, alturaFila - 24);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...COLOR_TEXTO_TENUE);
    doc.text('Entrada', xEntrada + anchoSub / 2, yEtiqueta, { align: 'center' });
    doc.text('Salida', xSalida + anchoSub / 2, yEtiqueta, { align: 'center' });

    doc.setDrawColor(...COLOR_BORDE);
    doc.rect(xEntrada, yBox, anchoSub, alturaBox);
    doc.rect(xSalida, yBox, anchoSub, alturaBox);

    if (fila.firma_entrada) {
      try { doc.addImage(fila.firma_entrada, 'PNG', xEntrada + 2, yBox + 2, anchoSub - 4, alturaBox - 4, undefined, 'FAST'); } catch { /* imagen corrupta */ }
    }
    if (fila.firma_salida) {
      try { doc.addImage(fila.firma_salida, 'PNG', xSalida + 2, yBox + 2, anchoSub - 4, alturaBox - 4, undefined, 'FAST'); } catch { /* imagen corrupta */ }
    } else if (!fila.hora_salida) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6);
      doc.setTextColor(160);
      doc.text('dentro', xSalida + anchoSub / 2, yBox + alturaBox / 2 + 2, { align: 'center' });
      doc.setTextColor(...COLOR_TEXTO);
    }
  }

  function dibujarFila(fila, alturaFila, numero, indiceZebra) {
    nuevaPaginaSiHaceFalta(alturaFila);
    const yInicio = y;
    fila.y = yInicio;

    if (indiceZebra % 2 === 1) {
      doc.setFillColor(...COLOR_ZEBRA);
      doc.rect(MARGEN, yInicio, anchoTabla, alturaFila, 'F');
    }

    doc.setDrawColor(...COLOR_BORDE);
    doc.setLineWidth(0.5);
    doc.rect(MARGEN, yInicio, anchoTabla, alturaFila);
    for (let i = 1; i < ENCABEZADOS.length; i++) {
      doc.line(xColumna(i), yInicio, xColumna(i), yInicio + alturaFila);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR_TEXTO);
    doc.text(String(numero).padStart(3, '0'), xColumna(0) + ANCHOS[0] / 2, yInicio + 15, { align: 'center' });

    const valores = [
      null,
      fila.nombre || '—',
      fila.hora_entrada ? String(fila.hora_entrada).slice(0, 5) : '—',
      fila.hora_salida ? String(fila.hora_salida).slice(0, 5) : '—',
      fila.puesto || '',
      fila.motivo || ''
    ];

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    valores.forEach((valor, i) => {
      if (valor === null) return;
      const lineas = doc.splitTextToSize(String(valor), ANCHOS[i] - 10);
      doc.text(lineas, xColumna(i) + 6, yInicio + 15);
    });

    celdaFirma(xColumna(6), ANCHOS[6], fila, alturaFila);

    y += alturaFila;
  }

  function dibujarPieDocumento() {
    nuevaPaginaSiHaceFalta(28);
    y += 12;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_TEXTO_TENUE);
    const nota = 'Cada registro debe completarse de forma legible y sin omisiones.';
    doc.text(doc.splitTextToSize(nota, anchoTabla), MARGEN, y);
    doc.setTextColor(...COLOR_TEXTO);
  }

  dibujarEncabezadoDocumento();
  dibujarEncabezadoTabla();

  const filas = ordenarRows(rows);

  if (filas.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_TEXTO_TENUE);
    doc.text('No hay registros para estos filtros.', MARGEN, y + 16);
    doc.setTextColor(...COLOR_TEXTO);
    y += 24;
  } else {
    filas.forEach((fila, i) => {
      dibujarFila(fila, calcularAlturaFila(fila), i + 1, i);
    });
  }

  dibujarPieDocumento();

  const fechaArchivo = new Date().toISOString().slice(0, 10);
  doc.save(`bitacora_cinoteca_${fechaArchivo}.pdf`);
}
