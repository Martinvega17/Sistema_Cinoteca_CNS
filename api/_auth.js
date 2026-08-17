import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as cookie from 'cookie';
import { query } from './_db.js';

const COOKIE_NAME = 'cinoteca_session';
const SESSION_HOURS = 8;

function getSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('Falta la variable de entorno JWT_SECRET (ver .env.example).');
  }
  return process.env.JWT_SECRET;
}

// ---------------------------------------------------------------------------
// Contraseñas
// ---------------------------------------------------------------------------
export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// ---------------------------------------------------------------------------
// Sesión (JWT dentro de una cookie httpOnly — el navegador nunca ve el token
// en JS, así que records.js/etc. solo necesitan mandar `credentials:'include'`)
// ---------------------------------------------------------------------------
export function createSessionCookie(usuario) {
  const token = jwt.sign(
    { sub: usuario.id, usuario: usuario.usuario, rol: usuario.rol },
    getSecret(),
    { expiresIn: `${SESSION_HOURS}h` }
  );
  return cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_HOURS * 60 * 60
  });
}

export function clearSessionCookie() {
  return cookie.serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
}

export function getSessionFromRequest(req) {
  const header = req.headers.cookie || '';
  const parsed = cookie.parse(header);
  const token = parsed[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, getSecret()); // { sub, usuario, rol, iat, exp }
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Manejo de errores — sin esto, cualquier excepción (p. ej. no poder
// conectar a la base de datos) se convierte en un 500 genérico de Vercel
// sin ningún detalle. Con esto, el frontend recibe el mensaje real y se
// puede diagnosticar sin adivinar.
// ---------------------------------------------------------------------------
export function withErrorHandling(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (err) {
      console.error('[api error]', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || 'Error interno del servidor.' });
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Wrappers para proteger endpoints
// ---------------------------------------------------------------------------
export function requireAuth(handler) {
  return withErrorHandling(async (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: 'No has iniciado sesión.' });
      return;
    }
    req.user = session;
    return handler(req, res);
  });
}

export function requireAdmin(handler) {
  return requireAuth(async (req, res) => {
    if (req.user.rol !== 'administrador') {
      res.status(403).json({ error: 'Esta acción requiere rol de administrador.' });
      return;
    }
    return handler(req, res);
  });
}

// ---------------------------------------------------------------------------
// Auditoría — se usa desde los endpoints que crean/corrigen información
// ---------------------------------------------------------------------------
export async function logAudit(usuarioId, accion, registroAfectado, detalles) {
  await query(
    `INSERT INTO auditoria (usuario_id, accion, registro_afectado, detalles)
     VALUES ($1, $2, $3, $4)`,
    [usuarioId, accion, registroAfectado, detalles ? JSON.stringify(detalles) : null]
  );
}
