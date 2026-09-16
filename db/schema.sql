-- ============================================================================
-- Esquema de base de datos · Sistema Cinoteca CNS
-- Motor: PostgreSQL (probado localmente)
-- ============================================================================
-- Como aplicarlo:
--   psql "$DATABASE_URL" -f db/schema.sql
-- o pegando este archivo en el SQL Editor de Neon.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Funcion auxiliar: mantiene updated_at al dia en cada UPDATE
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

-- Marca a las personas dadas de alta rápidamente desde "Personas que
-- ingresan" (visitas ocasionales que no son personal fijo del área),
-- a diferencia de las que un administrador da de alta desde "Personal".
ALTER TABLE personas ADD COLUMN IF NOT EXISTS es_visita BOOLEAN NOT NULL DEFAULT false;

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
  persona_id    INTEGER REFERENCES personas(id),
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_entrada  TIME NOT NULL,
  hora_salida   TIME,
  motivo        TEXT NOT NULL,
  registrado_por INTEGER,                  -- usuarios.id que capturó el registro
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- `persona_id` puede quedar NULL cuando el acceso es de una visita/personal
-- externo capturado al vuelo (ver visita_nombre/visita_puesto abajo): esa
-- persona NO se da de alta en el directorio `personas`, solo queda su
-- nombre "congelado" en el propio renglón de accesos.
ALTER TABLE accesos ALTER COLUMN persona_id DROP NOT NULL;
ALTER TABLE accesos ADD COLUMN IF NOT EXISTS visita_nombre TEXT;
ALTER TABLE accesos ADD COLUMN IF NOT EXISTS visita_puesto TEXT;

-- Todo renglón de acceso debe tener SIEMPRE a alguien identificado: o bien
-- un persona_id del directorio, o bien un visita_nombre capturado a mano.
ALTER TABLE accesos DROP CONSTRAINT IF EXISTS chk_accesos_alguien;
ALTER TABLE accesos ADD CONSTRAINT chk_accesos_alguien
  CHECK (persona_id IS NOT NULL OR visita_nombre IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Acompañante — FA-PT-0002 (Alcance) exige que todo personal externo a
-- almacenamiento y respaldos ingrese siempre acompañado por personal del
-- área. `acompanante_id` referencia al directorio `personas`; si quien
-- acompaña no está en el directorio, `acompanante_nombre` guarda su nombre
-- a mano (mismo patrón que persona_id/visita_nombre arriba).
-- ---------------------------------------------------------------------------
ALTER TABLE accesos ADD COLUMN IF NOT EXISTS acompanante_id INTEGER REFERENCES personas(id);
ALTER TABLE accesos ADD COLUMN IF NOT EXISTS acompanante_nombre TEXT;

-- El acompañante solo es obligatorio cuando el renglón es de una visita o
-- personal externo (persona_id NULL); el personal fijo del área que entra
-- por su cuenta no necesita acompañante.
ALTER TABLE accesos DROP CONSTRAINT IF EXISTS chk_accesos_acompanante_visita;
ALTER TABLE accesos ADD CONSTRAINT chk_accesos_acompanante_visita
  CHECK (
    persona_id IS NOT NULL
    OR acompanante_id IS NOT NULL
    OR acompanante_nombre IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- Firma digital — capturada en pantalla (canvas) desde celular, PC o
-- tablet, tanto al registrar la entrada como al registrar la salida.
-- Se guarda como imagen PNG codificada en base64 (data URL), lista para
-- insertarse tal cual en el PDF exportado. NO se agrega una tabla aparte:
-- va en el mismo renglón de `accesos` porque cada renglón ya representa a
-- una persona en un momento (entrada o salida) concreto.
-- ---------------------------------------------------------------------------
ALTER TABLE accesos ADD COLUMN IF NOT EXISTS firma_entrada TEXT;
ALTER TABLE accesos ADD COLUMN IF NOT EXISTS firma_entrada_fecha TIMESTAMPTZ;
ALTER TABLE accesos ADD COLUMN IF NOT EXISTS firma_salida TEXT;
ALTER TABLE accesos ADD COLUMN IF NOT EXISTS firma_salida_fecha TIMESTAMPTZ;

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
  rol           TEXT NOT NULL DEFAULT 'usuario' CHECK (rol IN ('usuario', 'administrador', 'responsable_institucional')),
  activo        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Upgrade path para bases de datos creadas antes de que existiera el rol
-- "responsable_institucional" (única cuenta autorizada para ejecutar el
-- borrado masivo de la bitácora completa — ver sección "Borrado" abajo).
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('usuario', 'administrador', 'responsable_institucional'));

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

-- ---------------------------------------------------------------------------
-- respaldos_eliminacion — copia automática de los renglones de `accesos`
-- justo antes de cualquier borrado masivo ("Limpiar registros de hoy" o
-- "Borrar todo el historial"). Tabla de SOLO ESCRITURA desde la aplicación:
-- no existe ningún endpoint que borre o modifique sus renglones, por lo que
-- funciona como respaldo mínimo independiente de la tabla que se borra,
-- incluso si el respaldo externo periódico (exportación JSON/CSV) no se
-- generó ese día. No sustituye la política de retención de 12 meses ni los
-- respaldos externos — es una última red de seguridad dentro de la misma
-- base de datos.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS respaldos_eliminacion (
  id                 SERIAL PRIMARY KEY,
  tipo               TEXT NOT NULL,           -- 'limpiar_hoy' | 'borrar_todo'
  usuario_id         INTEGER REFERENCES usuarios(id),   -- quien solicitó el borrado
  segundo_usuario_id INTEGER REFERENCES usuarios(id),   -- quien autorizó (solo 'borrar_todo')
  registros          JSONB NOT NULL,          -- snapshot completo de los renglones eliminados
  fecha              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_respaldos_eliminacion_fecha ON respaldos_eliminacion (fecha DESC);
