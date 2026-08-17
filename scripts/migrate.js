/**
 * Corre las migraciones de db/schema.sql contra DATABASE_URL.
 *
 * IMPORTANTE: este script NO parte el archivo por ";" a mano. Partir por
 * ";" rompe cualquier bloque delimitado con $$ ... $$ (como el cuerpo de
 * una función plpgsql), porque esos bloques traen sus propios ";" adentro
 * que no son fin de sentencia.
 *
 * En vez de eso, se manda el archivo completo en un solo client.query(sql).
 * node-postgres, cuando la llamada no lleva parámetros, usa el "simple
 * query protocol" de Postgres, que sí sabe ejecutar varias sentencias
 * separadas por ";" en un solo texto — y entiende el dollar-quoting
 * correctamente, porque el parseo lo hace el propio servidor de Postgres,
 * no un split() ingenuo en JS. Es exactamente lo mismo que hace `psql -f`.
 *
 * Uso:
 *   DATABASE_URL="postgres://...neon..." node scripts/migrate.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  console.log('🔍 Verificando conexión a la base de datos...');

  if (!process.env.DATABASE_URL) {
    console.error('❌ Falta la variable de entorno DATABASE_URL.');
    process.exit(1);
  }

  const schemaPath = path.resolve(__dirname, '..', 'db', 'schema.sql');
  console.log(`📂 Leyendo esquema desde: ${schemaPath}`);
  const sql = fs.readFileSync(schemaPath, 'utf8');
  console.log(`✅ Archivo de esquema leído (${sql.length} caracteres)`);

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('🚀 Ejecutando migración (archivo completo, una sola sentencia multi-statement)...');

  try {
    await client.query(sql);
    console.log('✅ Migración aplicada correctamente.');
  } catch (err) {
    console.error('❌ Error durante la migración:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

migrate();
