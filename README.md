# NAME@EMP — Delivery CRM

Plantilla de CRM de ventas y delivery: clientes, órdenes, reparto y notas de entrega.
Single-tenant (una empresa por instalación), 3 roles, con panel de administración y PWA.

## Stack

| Capa       | Tecnología                                           |
| ---------- | ---------------------------------------------------- |
| Backend    | Hono, Drizzle ORM, TypeScript                        |
| Base datos | PGlite (dev, embebida) · PostgreSQL (producción)     |
| Frontend   | React 19, Vite, Tailwind CSS v4, TanStack Query, PWA |
| Calidad    | ESLint, Prettier, Vitest (+ Testing Library, MSW)    |

> PGlite es Postgres compilado a WASM: en desarrollo **no hace falta levantar un servidor
> de base de datos**. El schema y las migraciones son idénticos en producción.

## Roles

| Rol          | Alcance                                                           |
| ------------ | ----------------------------------------------------------------- |
| `superadmin` | Acceso total: equipo, métodos de pago, conductores, reportes      |
| `vendedor`   | Sus propios clientes y órdenes + notas de entrega de sus entregas |
| `conductor`  | Sus entregas asignadas y el cambio de estado de las mismas        |

## Inicio rápido

```bash
# 1. Instalar dependencias (monorepo npm workspaces)
npm install

# 2. Configurar variables de entorno
cp backend/.env.example backend/.env
# Sin DATABASE_URL se usa PGlite (./.pglite). No hace falta nada más para dev.

# 3. Crear el schema
npm run db:migrate --workspace=backend

# 4. Cargar datos de ejemplo (opcional)
npm run db:seed --workspace=backend

# 5. Arrancar
npm run dev --workspace=backend    # API en http://localhost:3001
npm run dev --workspace=frontend   # SPA en http://localhost:5173
```

El frontend hace proxy de `/api` hacia `:3001`, así que abrí solo el `:5173`.

### Credenciales del seed

Todas con contraseña `Demo1234!`.

| Rol          | Email                                                                        |
| ------------ | ---------------------------------------------------------------------------- |
| `superadmin` | `demo@nameemp.com`                                                           |
| `vendedor`   | `vendedor1@nameemp.com`, `vendedor2@nameemp.com`                             |
| `conductor`  | `conductor1@nameemp.com`, `conductor2@nameemp.com`, `conductor3@nameemp.com` |

El seed también crea 5 clientes (Cliente Uno…Cinco) y 3 métodos de pago
(Efectivo, Transferencia, Tarjeta).

## Scripts

```bash
# Raíz (monorepo)
npm run lint          # ESLint en todos los workspaces
npm run format        # Prettier
npm run format:check  # Verifica formato sin escribir

# Backend
npm run dev --workspace=backend       # tsx --watch
npm run build --workspace=backend     # tsc → dist/
npm run start --workspace=backend     # node dist/index.js
npm run db:migrate --workspace=backend
npm run db:seed --workspace=backend
npm test --workspace=backend
npm run lint --workspace=backend

# Frontend
npm run dev --workspace=frontend      # Vite :5173
npm run build --workspace=frontend    # tsc -b && vite build
npm test --workspace=frontend
npm run lint --workspace=frontend
```

> `npm run build --workspace=frontend` encadena type-check + build y puede tardar. Para
> iterar rápido usá `npx tsc -b` y `npx vite build` por separado.

## Estructura

```
├── backend/
│   ├── src/
│   │   ├── routes/        Endpoints por dominio
│   │   ├── db/            Schema Drizzle, migraciones, seed
│   │   ├── middleware/    Auth, roles, rate limiting
│   │   ├── utils/         JWT, hash, contraseñas, PDF, TOTP, lockout, audit log
│   │   └── index.ts       Entry point
│   └── .env.example
├── frontend/
│   └── src/
│       ├── pages/         admin/ y público (auth)
│       ├── components/    UI + layouts
│       ├── hooks/         Queries (TanStack Query)
│       ├── context/       Auth, Theme
│       ├── lib/           Acceso por rol, utils
│       └── api/           Cliente HTTP
├── docker-compose.yml     Postgres + app (producción)
└── package.json           Monorepo (workspaces)
```

## API

Todos los endpoints viven bajo `/api`. Salvo `/auth/*`, requieren
`Authorization: Bearer <token>`.

| Grupo                  | Endpoints                                                             |
| ---------------------- | --------------------------------------------------------------------- |
| `/api/auth`            | login, refresh, logout, perfil, 2FA TOTP, recuperación por 2FA        |
| `/api/orders`          | CRUD, asignación de conductor (manual y automática), cambio de estado |
| `/api/customers`       | CRUD de clientes                                                      |
| `/api/users`           | CRUD del equipo + reseteo de claves (solo `superadmin`)               |
| `/api/payment-methods` | CRUD de métodos de pago                                               |
| `/api/notifications`   | Listado y marcado de lectura                                          |
| `/api/dashboard`       | Métricas según el rol del usuario autenticado                         |
| `/api/reports`         | `GET /delivery-notes` → PDF de notas de entrega por cliente y período |

### Notas de entrega (PDF)

```
GET /api/reports/delivery-notes?clienteId=<opcional>&periodo=dia|semana|mes&fecha=YYYY-MM-DD
```

Genera una nota por cliente con las órdenes entregadas en el período (una página por
cliente). Roles: `superadmin` y `vendedor`; un `vendedor` solo ve sus propias entregas.
Los períodos se calculan en hora local: `dia` = 00:00 del día a 00:00 del siguiente.

## Estado de una orden

```
created → assigned → in_transit → delivered
                  ↘ cancelled
```

`paymentStatus`: `pending` | `paid` | `refunded` | `cancelled`.

## Notas de producción

- **`JWT_SECRET` es obligatorio** y debe ser un valor propio: `openssl rand -hex 32`.
- **`DATABASE_URL`** — si está definida, se usa PostgreSQL (vía `postgres-js`); si no,
  PGlite contra `./.pglite`. Nunca commitees `.pglite/`: es una base local de desarrollo.
- **`BUSINESS_NAME`** — nombre que aparece en el encabezado y pie de los PDF.
- **Reseteo de contraseñas:** el sistema NO manda emails. El `superadmin` le asigna al
  empleado una contraseña temporal desde el panel (`POST /api/users/:id/reset-password`),
  y el sistema lo obliga a cambiarla en el primer login (mientras tanto no le da sesión,
  solo un `challengeToken`) y le revoca las sesiones que tuviera abiertas.
- El **rate limiter es en memoria**: cada instancia tiene sus propios contadores. Con
  múltiples instancias hace falta Redis (ver `src/middleware/rate-limit.ts`).
- `docker-compose.yml` **no expone** el puerto de Postgres al host a propósito.

## Licencia

Propietaria.
