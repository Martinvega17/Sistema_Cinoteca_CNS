/**
 * Crea (o actualiza) un usuario administrador directamente en la base de
 * datos. Se usa una sola vez para tener con qué iniciar sesión la primera
 * vez; después, ese administrador puede crear más usuarios desde la
 * pestaña "Admin" del sistema.
 *
 * Uso:
 *   DATABASE_URL="postgres://...neon..." node scripts/create-admin.js <usuario> <password>
 *
 * o, si ya tienes DATABASE_URL en tu .env local:
 *   npm run db:create-admin -- <usuario> <password>
 */
import pg from 'pg';
import bcrypt from 'bcryptjs';

const [, , usuario, password] = process.argv;

if (!usuario || !password) {
  console.error('Uso: node scripts/create-admin.js <usuario> <password>');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('Falta la variable de entorno DATABASE_URL.');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

try {
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (usuario, password_hash, rol, activo)
     VALUES ($1, $2, 'administrador', true)
     ON CONFLICT (usuario)
     DO UPDATE SET password_hash = EXCLUDED.password_hash, rol = 'administrador', activo = true
     RETURNING id, usuario, rol`,
    [usuario, hash]
  );
  console.log('Administrador listo:', rows[0]);
} catch (err) {
  console.error('Error creando el administrador:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
