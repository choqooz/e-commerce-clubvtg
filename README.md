# ClubVTG

Plataforma e-commerce de ropa vintage argentina con probador virtual por IA.

## Stack

| Capa | Tecnologia |
|------|-----------|
| Framework | Next.js 16 (Turbopack) + React 19 + TypeScript |
| Auth | Clerk v7 |
| Base de datos | Supabase (PostgreSQL + Storage) |
| Pagos | MercadoPago Checkout Pro |
| AI Try-On | OpenAI gpt-image-1.5 + GPT-4o-mini (content guard) |
| Emails | Resend + React Email |
| Rate Limiting | Upstash Redis |
| Styling | Tailwind CSS v4 + shadcn/ui v4 (radix-nova) |
| Image Processing | Sharp |

## Features

### Tienda

- Catalogo con filtros de 6 dimensiones: talle, marca, color (swatches), precio, condicion, subcategoria
- Detalle de producto con galeria de imagenes y breadcrumbs
- Carrito lateral (drawer) con persistencia en localStorage
- Checkout con datos de envio (Correo Argentino, tarifa flat)
- Integracion MercadoPago Checkout Pro con webhooks
- Emails transaccionales de recibo via Resend
- SEO: generateMetadata en paginas de producto
- Loading skeletons, error boundaries, pagina 404

### Admin (/admin)

- CRUD de productos con upload de imagenes a Supabase Storage
- Campos: titulo, descripcion, precio, categoria, subcategoria, marca, condicion, talle, color, medidas
- Gestion de estado: Disponible / Vendido / Archivado
- Tabla de ordenes con actualizacion de estado (Pendiente / Pagado / Enviado / Cancelado)
- Protegido por verificacion de email admin via Clerk

### AI Virtual Try-On (/try-on)

- Upload de foto del usuario con resize client-side (canvas, JPEG 0.95)
- Generacion via OpenAI gpt-image-1.5 con input_fidelity: high
- Prompt consciente del tipo de prenda (Tops/Bottoms/Outerwear/Accessories)
- Tamano dinamico segun orientacion (portrait 1024x1536, landscape 1536x1024)
- Streaming SSE con 6 pasos de progreso
- Content guard: Moderation API (gratis) + GPT-4o-mini vision (~$0.004)
- Zoom lightbox en resultado (hasta 2x, pinch-to-zoom en mobile)
- Retry automatico en falla de OpenAI (1x, 1s delay)
- Rate limiting: 5 req/min por usuario (Upstash Redis)

### Sistema de Creditos (/credits)

- 2 creditos de bienvenida procesados de forma idempotente por el webhook de ciclo de vida de Clerk
- Packs: Basic (3/$1,500), Popular (7/$3,000), Pro (15/$5,500 ARS)
- Compra via MercadoPago (mismo flujo de webhooks)
- Deduccion atomica via Supabase RPC
- Balance visible en el header

### Seguridad

- Auth + verificacion de admin en todos los Server Actions
- Supabase RLS (usuarios solo acceden a sus datos)
- Verificacion HMAC-SHA256 en webhooks de MercadoPago
- Validacion de uploads (5MB, MIME whitelist, EXIF stripping)
- Moderacion de contenido (NSFW + verificacion de persona)
- Rate limiting con Upstash Redis

## Estructura

```
src/
├── app/
│   ├── (shop)/               # Catalogo, checkout
│   ├── admin/                # Panel admin (productos, ordenes)
│   ├── api/                  # API routes (AI, webhooks, upload)
│   ├── credits/              # Compra de creditos
│   ├── product/[slug]/       # Detalle de producto
│   ├── try-on/[productSlug]/ # Probador virtual
│   └── sign-in/              # Auth
├── components/
│   ├── admin/                # Componentes admin
│   ├── credits/              # Balance, pack cards
│   ├── try-on/               # Uploader, progress, result, zoom
│   ├── ui/                   # shadcn/ui primitives
│   └── ...                   # Catalogo, carrito, header, footer
├── contexts/                 # Cart context
└── lib/
    ├── actions/              # Server Actions
    ├── ai/                   # OpenAI, prompts, image processing, content guard
    ├── supabase/             # Clientes Supabase (anon + admin)
    └── validations/          # Zod schemas
supabase/
└── migrations/               # Migraciones SQL versionadas hasta 022
```

## Variables de Entorno

### Auth (Clerk)

| Variable | Requerida | Descripcion |
|----------|-----------|-------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Si | Clerk publishable key |
| `CLERK_SECRET_KEY` | Si | Clerk secret key |
| `CLERK_WEBHOOK_SECRET` | Si | Secret para verificar webhooks de Clerk |
| `ADMIN_EMAIL` | Si | Email del administrador |

### Base de Datos (Supabase)

| Variable | Requerida | Descripcion |
|----------|-----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Si | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Si | Anon key (publica, RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Si | Service role key (server-only) |

### Pagos (MercadoPago)

| Variable | Requerida | Descripcion |
|----------|-----------|-------------|
| `MP_ACCESS_TOKEN` | Si | Access token de MercadoPago |
| `MP_WEBHOOK_SECRET` | Produccion | Secret para verificacion HMAC |

### AI (OpenAI)

| Variable | Requerida | Descripcion |
|----------|-----------|-------------|
| `OPENAI_API_KEY` | Si | API key (org verificada) |

### Rate Limiting (Upstash)

| Variable | Requerida | Descripcion |
|----------|-----------|-------------|
| `UPSTASH_REDIS_REST_URL` | Opcional en dev | URL de Upstash Redis |
| `UPSTASH_REDIS_REST_TOKEN` | Opcional en dev | Token de Upstash Redis |

### Emails (Resend)

| Variable | Requerida | Descripcion |
|----------|-----------|-------------|
| `RESEND_API_KEY` | Si | API key de Resend |
| `RESEND_FROM_EMAIL` | Si | Verified sender identity, for example `ClubVTG <orders@your-domain.example>` |

Configure `RESEND_FROM_EMAIL` with a sender identity verified in Resend. The application does not use a development sender when this value is unavailable or invalid.

### App

| Variable | Requerida | Descripcion |
|----------|-----------|-------------|
| `NEXT_PUBLIC_APP_URL` | Produccion | URL base de la app |
| `NEXT_PUBLIC_NGROK_URL` | Solo dev | URL de ngrok para webhooks |

### Authenticated E2E (Clerk)

`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `E2E_CLERK_USER_EMAIL` are required by authenticated E2E. The first two must be Clerk development test credentials; `E2E_CLERK_USER_EMAIL` must identify a dedicated Clerk development test user with no orders.

### Configuracion de tienda

| Variable | Requerida | Descripcion |
|----------|-----------|-------------|
| `SHIPPING_FLAT_FEE` | No | Tarifa de envio; por defecto `5000` |
| `CREDIT_PACK_BASIC_AMOUNT` | No | Creditos del pack Basic; por defecto `3` |
| `CREDIT_PACK_BASIC_PRICE` | No | Precio del pack Basic; por defecto `1500` |
| `CREDIT_PACK_POPULAR_AMOUNT` | No | Creditos del pack Popular; por defecto `7` |
| `CREDIT_PACK_POPULAR_PRICE` | No | Precio del pack Popular; por defecto `3000` |
| `CREDIT_PACK_PRO_AMOUNT` | No | Creditos del pack Pro; por defecto `15` |
| `CREDIT_PACK_PRO_PRICE` | No | Precio del pack Pro; por defecto `5500` |

### Observabilidad opcional

| Variable | Requerida | Descripcion |
|----------|-----------|-------------|
| `NEXT_PUBLIC_SENTRY_DSN` | No | Habilita Sentry con muestreo de trazas de `0.1` |
| `SENTRY_AUTH_TOKEN` | Solo build con source maps | Token server-only para subir source maps a Sentry |
| `SENTRY_ORG` | Solo build con source maps | Slug de la organizacion de Sentry |
| `SENTRY_PROJECT` | Solo build con source maps | Slug del proyecto de Sentry |
| `NEXT_PUBLIC_POSTHOG_KEY` | No | Habilita eventos PostHog con persistencia en memoria |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | Host opcional de PostHog; usa el valor predeterminado si esta vacio |

Sin `NEXT_PUBLIC_SENTRY_DSN` o `NEXT_PUBLIC_POSTHOG_KEY`, la aplicacion sigue funcionando y no envia telemetria.

## Setup

### Requisitos

- Node.js 22 (consultá `.nvmrc`)
- Cuentas en: Clerk, Supabase, MercadoPago, OpenAI (org verificada), Resend

### Instalacion

```bash
npm ci
cp .env.local.example .env.local  # Completar solo valores locales
npm run dev
```

### Limites locales y webhooks

La autoridad de produccion es exclusivamente la base de datos; la aplicacion local es un cliente de esa autoridad cuando recibe credenciales aprobadas. Esta guia no cubre cambios de infraestructura remota.

**Advertencia MercadoPago:** mantené `MP_WEBHOOK_SECRET` fuera del repositorio. `NEXT_PUBLIC_NGROK_URL` es solo un tunel temporal de desarrollo; nunca dirijas un webhook de produccion a una URL local o temporal.

## Scripts

| Comando | Descripcion |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo (Turbopack) |
| `npm run build` | Build de produccion |
| `npm run start` | Servidor de produccion |
| `npm run lint` | ESLint |
| `npm run type-check` | TypeScript sin emitir archivos |
| `npm test` | Suite unitaria con Vitest |
| `npm run test:database` | Pruebas de migraciones SQL aisladas con Docker |
| `npm run test:payment-webhook` | Pruebas enfocadas del flujo de pagos y webhook de MercadoPago |
| `npm run test:e2e` | Pruebas E2E del storefront con Playwright |
| `npm run test:e2e:headed` | Pruebas E2E del storefront con navegador visible |
| `npm run test:e2e:auth` | Pruebas E2E autenticadas con Clerk |

## Licencia

Privado
