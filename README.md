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
├── vercel.json
├── db/
│   └── schema.sql          ← esquema completo (correrlo una sola vez)
├── api/
│   ├── _db.js               ← conexión a Postgres (pool compartido)
│   ├── _auth.js              ← hash de contraseñas, JWT, requireAuth/requireAdmin, auditoría
│   ├── auth/{login,logout,me}.js
│   ├── personas/{index,[id]}.js
│   ├── accesos/{index.js, [id]/salida.js}
│   ├── exportar/{json,csv}.js
│   ├── auditoria/index.js
│   └── usuarios/{index,[id]}.js
├── scripts/
│   ├── create-admin.js      ← crea el primer usuario administrador
│   └── dev-server.js        ← servidor local para probar todo sin desplegar
└── src/
    ├── css/                 (Tailwind + estilos propios)
    ├── assets/logo-cns.webp
    └── js/
        ├── main.js           ← arranca todo según la sesión
        ├── api.js             ← fetch con cookies + manejo de errores
        ├── auth.js            ← pantalla de login / logout
        ├── tabs.js            ← Registrar / Registros / Personal / Admin
        ├── multiselect.js     ← selector de personas (carga desde /api/personas)
        ├── records.js         ← pestaña "Registrar" (hoy)
        ├── reportes.js        ← pestaña "Registros" (histórico, filtros, exportar)
        ├── personal-admin.js  ← pestaña "Personal" (solo admin)
        ├── admin.js           ← pestaña "Admin" (usuarios + auditoría)
        ├── validation.js      ← reglas de horario (las usan cliente Y servidor)
        └── ui.js               ← notificación flotante (toast)
```

## Base de datos

Cuatro tablas, tal como se planteó:

- **`personas`** — directorio de personal. Dar de baja nunca borra el
  registro: solo pone `activo = false` y `fecha_baja = now()`, para
  conservar el historial de accesos de esa persona.
- **`accesos`** — un renglón **por persona** que entra. Si entran 5 personas
  juntas, son 5 renglones que comparten `folio_grupo` (así se pueden
  agrupar en pantalla, pero cada quien registra su propia salida).
  `hora_salida IS NULL` = sigue dentro.
- **`usuarios`** — quién puede entrar al sistema y con qué rol
  (`usuario` | `administrador`).
- **`auditoria`** — quién hizo qué y cuándo (creación de accesos, salidas,
  altas/bajas de personas, cambios de usuarios).

`src/js/validation.js` (margen de ±3 min en la entrada, salida ≥ entrada) es
código sin dependencias del navegador, así que el **mismo archivo** se usa
tanto en el frontend (para feedback instantáneo) como en `/api/accesos`
(para que la regla se cumpla de verdad, sin depender de que nadie manipule
el JS del navegador).

## Roles y permisos

| Acción                          | usuario | administrador |
|----------------------------------|:-------:|:--------------:|
| Registrar entrada / salida       | ✅      | ✅             |
| Consultar Registros (histórico)  | ✅      | ✅             |
| Exportar JSON / CSV              | ✅      | ✅             |
| Agregar / editar / dar de baja personas | ❌ | ✅          |
| Crear / desactivar usuarios      | ❌      | ✅             |
| Ver auditoría                    | ❌      | ✅             |

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
3. Pégala en un archivo `.env` local (cópialo de `.env.example`) como
   `DATABASE_URL`, y genera un `JWT_SECRET` (el mismo `.env.example` trae
   el comando para generarlo).

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
   el repo.
3. En **Settings → Environment Variables** agrega `DATABASE_URL` y
   `JWT_SECRET` (los mismos valores que usaste en local).
4. Vercel detecta `vercel.json`, corre `npm run build` (compila Tailwind) y
   despliega tanto el sitio estático como las funciones de `/api`
   automáticamente. Cada push a la rama principal vuelve a desplegar solo.

## Notas

- Las contraseñas nunca se guardan en texto plano — se hashean con
  `bcrypt` antes de tocar la base de datos.
- La sesión vive en una cookie `httpOnly`, no en `localStorage`, así que un
  script malicioso en la página no puede leer el token.
- Los datos ya no dependen del navegador de una sola computadora: viven en
  Neon, así que cualquier equipo con acceso al sistema ve la misma
  información en tiempo real.
