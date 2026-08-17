-- ============================================================================
-- Esquema de base de datos · Sistema Cinoteca CNS
-- Motor: PostgreSQL (probado localmente; pensado para Neon)
-- ============================================================================
-- Cómo aplicarlo:
--   psql "$DATABASE_URL" -f db/schema.sql
-- o pegando este archivo en el SQL Editor de Neon.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Función auxiliar: mantiene updated_at al día en cada UPDATE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- personas — directorio de personal que puede registrar accesos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS personas (
  id           SERIAL PRIMARY KEY,
  nombre       TEXT NOT NULL,
  area         TEXT,
  puesto       TEXT NOT NULL,
  activo       BOOLEAN NOT NULL DEFAULT true,
  fecha_alta   TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_baja   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personas_activo ON personas (activo);
CREATE INDEX IF NOT EXISTS idx_personas_nombre ON personas (nombre);

DROP TRIGGER IF EXISTS trg_personas_updated_at ON personas;
CREATE TRIGGER trg_personas_updated_at
  BEFORE UPDATE ON personas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Secuencia para folios de grupo — varias personas que entran juntas
-- comparten un folio aunque cada una tenga su propio renglón en `accesos`.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS folio_seq START 1;

-- ---------------------------------------------------------------------------
-- accesos — un renglón por persona que entra (si entran 5 personas juntas,
-- son 5 renglones con el mismo folio_grupo para poder agruparlos en pantalla)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accesos (
  id            SERIAL PRIMARY KEY,
  folio_grupo   TEXT NOT NULL,             -- agrupa a quienes entraron juntos
  persona_id    INTEGER NOT NULL REFERENCES personas(id),
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_entrada  TIME NOT NULL,
  hora_salida   TIME,
  motivo        TEXT NOT NULL,
  registrado_por INTEGER,                  -- usuarios.id que capturó el registro
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accesos_fecha ON accesos (fecha);
CREATE INDEX IF NOT EXISTS idx_accesos_persona ON accesos (persona_id);
CREATE INDEX IF NOT EXISTS idx_accesos_folio_grupo ON accesos (folio_grupo);
-- Acelera "¿quién sigue dentro?" (hora_salida IS NULL)
CREATE INDEX IF NOT EXISTS idx_accesos_abiertos ON accesos (fecha) WHERE hora_salida IS NULL;

DROP TRIGGER IF EXISTS trg_accesos_updated_at ON accesos;
CREATE TRIGGER trg_accesos_updated_at
  BEFORE UPDATE ON accesos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- usuarios — quién puede entrar al sistema y qué rol tiene
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  usuario       TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol           TEXT NOT NULL DEFAULT 'usuario' CHECK (rol IN ('usuario', 'administrador')),
  activo        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_usuarios_updated_at ON usuarios;
CREATE TRIGGER trg_usuarios_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- auditoria — quién modificó qué (para poder rastrear correcciones)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria (
  id                SERIAL PRIMARY KEY,
  usuario_id        INTEGER REFERENCES usuarios(id),
  accion            TEXT NOT NULL,          -- p. ej. 'accesos.salida.corregida'
  registro_afectado TEXT,                   -- p. ej. 'accesos:125'
  detalles          JSONB,
  fecha             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria (usuario_id);
