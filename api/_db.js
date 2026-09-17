import pg from 'pg';

const { Pool } = pg;

// En serverless (Vercel) cada instancia puede reutilizar el pool entre
// invocaciones si vive en el ámbito del módulo — por eso es un singleton
// a nivel de archivo y no se crea uno nuevo en cada función.
let pool;

export function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'Falta la variable de entorno DATABASE_URL. Configúrala con tu cadena de conexión de Neon (ver .env.example).'
      );
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Neon requiere SSL; con sslmode=require en la cadena de conexión
      // basta, pero forzamos rejectUnauthorized:false por compatibilidad.
      ssl: process.env.DATABASE_URL.includes('localhost')
        ? false
        : { rejectUnauthorized: false }
    });

    // CRÍTICO: sin este listener, un error de red en un cliente INACTIVO
    // del pool (p. ej. Neon cierra la conexión por inactividad, algo muy
    // común en Postgres serverless) tumba TODO el proceso de Node — no
    // solo esa petición. `pool` es un EventEmitter: emitir 'error' sin
    // nadie escuchando se trata como excepción no capturada y mata el
    // proceso completo, dejando el servidor sin responder a NADA (por
    // eso, tras un solo fallo así, hasta un GET normal a /api/accesos
    // da "conexión rechazada": ya no hay servidor vivo del otro lado).
    // Esto es justo lo que pasaba al usar "Borrar TODO el historial": esa
    // acción espera a que la persona conteste 3 prompts seguidos, y ese
    // tiempo de espera es más que suficiente para que un cliente inactivo
    // del pool se caiga. Con este listener, el error solo se registra en
    // consola y ese cliente se descarta — el resto del pool sigue
    // funcionando con normalidad.
    pool.on('error', (err) => {
      console.error('Error inesperado en un cliente inactivo del pool de Postgres:', err);
    });
  }
  return pool;
}

export async function query(text, params) {
  const client = getPool();
  return client.query(text, params);
}

// Cliente dedicado para operaciones que necesitan transacción (BEGIN/COMMIT/
// ROLLBACK) — p. ej. respaldar y borrar en la misma unidad atómica en
// api/accesos/index.js. Quien lo pide es responsable de client.release().
export async function getClient() {
  const pool = getPool();
  return pool.connect();
}
