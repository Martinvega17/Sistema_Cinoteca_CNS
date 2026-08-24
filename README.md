# Sistema Cinoteca CNS

Bitácora de acceso a la Cinoteca del CNS (IPICYT), con base de datos real
(PostgreSQL / Neon), autenticación por roles y auditoría de cambios.

## Arquitectura

```
   USUARIO (navegador)
        │
        ▼
   ┌─────────────────────────┐
   │  VERCEL                 │
   │  index.html + Tailwind  │
   │  src/js/*.js  (frontend)│
   │  api/*.js     (backend) │
   └────────────┬────────────┘
                │  pg (SSL)
                ▼
   ┌─────────────────────────┐
   │  PostgreSQL (Neon)      │
   │  personas · accesos     │
   │  usuarios · auditoria   │
   └─────────────────────────┘
```

- **Frontend**: HTML + Tailwind + JS modular (sin framework), en `src/js/`.
- **Backend**: funciones serverless de Vercel en `/api`, cada archivo es un
  endpoint (así rutea Vercel automáticamente, sin configuración extra).
- **Base de datos**: PostgreSQL. Se probó todo localmente y está pensado
  para [Neon](https://neon.tech) (tiene plan gratuito y funciona muy bien
  con Vercel).
- **Autenticación**: usuario/contraseña con `bcrypt`, sesión en cookie
  `httpOnly` firmada con JWT (el navegador nunca ve el token en JS).
- **Exportaciones**: JSON y CSV, generadas por el propio backend a partir
  de la base de datos (ya no de `localStorage`).

## Estructura del proyecto

```
├── index.html
├── package.json
├── db/
│   └── schema.sql          ← esquema completo (correrlo una sola vez, o vía npm run db:migrate)
├── api/                     ← 12 funciones serverless (límite exacto del plan Hobby de Vercel,
│   │                          ver nota en "Notas" más abajo antes de agregar una más)
│   ├── _db.js               ← conexión a Postgres (pool compartido)
│   ├── _auth.js              ← hash de contraseñas, JWT, requireAuth/requireAdmin, auditoría
│   ├── auth/{login,logout,me}.js
│   ├── personas/{index,[id]}.js       ← index.js también resuelve altas de "visita" (es_visita)
│   ├── accesos/{index.js, [id]/salida.js}   ← index.js: CRUD + ?resumen=meses + DELETE ?todo=true
│   ├── exportar/{json,csv}.js
│   ├── auditoria/index.js
│   └── usuarios/{index,[id]}.js
├── scripts/
│   ├── create-admin.js      ← crea el primer usuario administrador
│   ├── migrate.js           ← aplica db/schema.sql (lo corre `npm run db:migrate` y el build de Vercel)
│   └── dev-server.js        ← servidor local para probar todo sin desplegar
└── src/
    ├── css/                 (Tailwind + estilos propios)
    ├── assets/logo-cns.webp
    └── js/
        ├── main.js              ← arranca todo según la sesión (único punto de entrada)
        ├── core/                ← compartido por cualquier rol logueado
        │   ├── api.js            ← fetch con cookies + manejo de errores
        │   ├── auth.js           ← pantalla de login / logout
        │   ├── tabs.js           ← cambia entre Registrar / Registros / Personal / Admin
        │   ├── validation.js     ← reglas de horario (las usan cliente Y servidor)
        │   ├── ui.js             ← notificación flotante (toast)
        │   └── clock.js          ← reloj en vivo del header
        ├── user/                ← pestañas visibles para cualquier usuario logueado
        │   ├── multiselect.js     ← selector de personas (pestaña "Registrar")
        │   ├── records.js         ← pestaña "Registrar" (bitácora de hoy)
        │   └── reportes.js        ← pestaña "Registros" (histórico, filtros, exportar)
        └── admin/               ← solo rol administrador (pestañas ocultas para "usuario")
            ├── personal-admin.js  ← pestaña "Personal" (alta/edición/baja de personal)
            └── admin.js           ← pestaña "Admin" (usuarios, auditoría, limpieza de accesos)
```

`main.js` es el único archivo que conoce las tres carpetas: importa lo de
`core/` siempre, y solo importa/inicializa lo de `admin/` cuando
`session.rol === 'administrador'`. `user/` y `admin/` nunca se importan
entre sí — si algún día se vuelve a dividir el rol "usuario" en más
permisos, esta misma carpeta `user/` es donde crece.

## Base de datos

Cuatro tablas:

- **`personas`** — directorio de personal. Dar de baja nunca borra el
  registro: solo pone `activo = false` y `fecha_baja = now()`, para
  conservar el historial de accesos de esa persona. La columna
  `es_visita` distingue al personal fijo (dado de alta desde la pestaña
  "Personal", solo admin) de las visitas agregadas al vuelo desde el
  selector de la pestaña "Registrar" (cualquier usuario logueado).
- **`accesos`** — un renglón **por persona** que entra. Si entran 5 personas
  juntas, son 5 renglones que comparten `folio_grupo` (así se pueden
  agrupar en pantalla, pero cada quien registra su propia salida).
  `hora_salida IS NULL` = sigue dentro. El número de folio sale de la
  secuencia `folio_seq`, que los botones de limpieza del panel Admin
  pueden reiniciar a 001.
- **`usuarios`** — quién puede entrar al sistema y con qué rol
  (`usuario` | `administrador`).
- **`auditoria`** — quién hizo qué y cuándo (creación de accesos, salidas,
  altas/bajas de personas, cambios de usuarios, limpiezas de accesos).

`src/js/core/validation.js` (margen de ±3 min en la entrada, salida ≥ entrada) es
código sin dependencias del navegador, así que el **mismo archivo** se usa
tanto en el frontend (para feedback instantáneo) como en `/api/accesos`
(para que la regla se cumpla de verdad, sin depender de que nadie manipule
el JS del navegador).

## Roles y permisos

| Acción                          | usuario | administrador |
|----------------------------------|:-------:|:--------------:|
| Registrar entrada / salida       | ✅      | ✅             |
| Agregar una visita al vuelo (no exclusiva del área) | ✅ | ✅ |
| Consultar Registros (histórico)  | ✅      | ✅             |
| Exportar JSON / CSV              | ✅      | ✅             |
| Agregar / editar / dar de baja personal fijo | ❌ | ✅          |
| Crear / desactivar usuarios      | ❌      | ✅             |
| Ver auditoría                    | ❌      | ✅             |
| Limpiar registros de hoy (reinicia folio) | ❌ | ✅         |
| Borrar TODO el historial de accesos | ❌  | ✅ (doble confirmación) |

Las pestañas "Personal" y "Admin" ni siquiera se muestran si el rol no es
administrador, pero además cada endpoint del backend revisa el rol por su
cuenta (`requireAdmin`) — el ocultamiento en pantalla es solo comodidad, no
la protección real.

## Poner esto a andar

### 1. Crear la base de datos en Neon

1. Crea una cuenta y un proyecto en [neon.tech](https://neon.tech) (plan
   gratuito).
2. Copia la cadena de conexión (Connection Details → incluye
   `?sslmode=require`).
3. Crea un archivo `.env` en la raíz del proyecto (no se sube a git) con:
   ```
   DATABASE_URL="postgres://usuario:password@host/db?sslmode=require"
   JWT_SECRET="una-cadena-larga-y-aleatoria"
   ```
   `JWT_SECRET` puedes generarlo con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### 2. Aplicar el esquema

```bash
npm install
npm run db:migrate
```

(o pega el contenido de `db/schema.sql` en el SQL Editor de Neon)

### 3. Crear el primer administrador

La API no puede crear el primer usuario sola (necesitaría una sesión que
todavía no existe), así que se hace una vez desde la terminal:

```bash
DATABASE_URL="tu-cadena-de-neon" node scripts/create-admin.js admin TuClaveSegura123
```

Con ese usuario ya puedes entrar al sistema y, desde la pestaña "Admin",
crear el resto de los usuarios (rol `usuario` o `administrador`).

### 4. Probarlo localmente antes de desplegar

```bash
npm run build:css
DATABASE_URL="tu-cadena-de-neon" JWT_SECRET="tu-secreto" npm run dev
```

Abre `http://localhost:3000`. `scripts/dev-server.js` emula cómo Vercel
sirve `/api` en producción — es solo para desarrollo; en Vercel no se usa
este archivo, el ruteo de `/api` es automático a partir de la estructura de
carpetas.

### 5. Desplegar en Vercel (plan gratuito)

1. Sube el proyecto a GitHub.
2. En [vercel.com](https://vercel.com) → **Add New → Project** → importa
   el repo (no hace falta `vercel.json`: Vercel detecta `/api` y sirve
   `index.html` automáticamente por convención de carpetas).
3. En **Settings → Environment Variables** agrega `DATABASE_URL` y
   `JWT_SECRET` (los mismos valores que usaste en local).
4. Cada push a la rama principal corre `npm run build` (compila Tailwind
   + aplica `db/schema.sql` vía `db:migrate`) y despliega solo.

## Notas

- Las contraseñas nunca se guardan en texto plano — se hashean con
  `bcrypt` antes de tocar la base de datos.
- La sesión vive en una cookie `httpOnly`, no en `localStorage`, así que un
  script malicioso en la página no puede leer el token.
- Los datos ya no dependen del navegador de una sola computadora: viven en
  Neon, así que cualquier equipo con acceso al sistema ve la misma
  información en tiempo real.
- **Límite de 12 Serverless Functions (plan Hobby):** cada archivo `.js`
  dentro de `/api` (menos los que empiezan con `_`) cuenta como una
  función. Ahorita hay exactamente 12. Si agregas un endpoint nuevo,
  primero revisa si cabe como un parámetro de query dentro de un archivo
  existente (así se hizo con `?resumen=meses` y `?todo=true` en
  `api/accesos/index.js`) en vez de crear un archivo nuevo — o el deploy
  falla en Vercel sin avisar claramente por qué.
- **Al copiar archivos actualizados a tu proyecto local:** nunca
  sobrescribas `.env`, `.git/` ni `node_modules/` — no viajan en zips ni
  copias de este tipo. Solo reemplaza `index.html`, `src/`, `api/`,
  `db/`, `scripts/`.
