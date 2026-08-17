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
  }
  return pool;
}

export async function query(text, params) {
  const client = getPool();
  return client.query(text, params);
}
