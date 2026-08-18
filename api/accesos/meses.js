import { query } from '../_db.js';
import { requireAuth } from '../_auth.js';

/**
 * Devuelve, para cada año que tiene al menos un registro, la lista de
 * meses (1-12) con registros. Lo usa el frontend para pintar las pestañas
 * "Registros" > mes, sin tener que traer todo el histórico al navegador.
 */
async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const { rows } = await query(
    `SELECT EXTRACT(YEAR FROM fecha)::int AS anio,
            EXTRACT(MONTH FROM fecha)::int AS mes,
            COUNT(*)::int AS total
     FROM accesos
     GROUP BY 1, 2
     ORDER BY 1 DESC, 2 DESC`
  );

  const porAnio = {};
  for (const row of rows) {
    if (!porAnio[row.anio]) porAnio[row.anio] = [];
    porAnio[row.anio].push({ mes: row.mes, total: row.total });
  }

  res.status(200).json({ anios: porAnio });
}

export default requireAuth(handler);
