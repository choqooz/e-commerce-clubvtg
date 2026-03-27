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

- 2 creditos gratis al verificar email
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
└── migrations/               # 001-007
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

### App

| Variable | Requerida | Descripcion |
|----------|-----------|-------------|
| `NEXT_PUBLIC_APP_URL` | Produccion | URL base de la app |
| `NEXT_PUBLIC_NGROK_URL` | Solo dev | URL de ngrok para webhooks |

## Setup

### Requisitos

- Node.js 18+
- Cuentas en: Clerk, Supabase, MercadoPago, OpenAI (org verificada), Resend

### Instalacion

```bash
npm install
cp .env.example .env  # Configurar variables
npm run dev
```

### Base de Datos

Ejecutar las migraciones de Supabase en orden:

```
001_initial_schema.sql      # Tablas base, profiles, AI logs, RPCs
002_rls_policies.sql        # Row Level Security
004_extend_products_schema.sql  # Campos extendidos de productos
005_orders_schema.sql       # Ordenes y items
006_drop_color_hex.sql      # Cleanup columna muerta
007_storage_buckets.sql     # Buckets de Storage (user-uploads, ai-results)
```

### Buckets de Supabase Storage

Crear manualmente si no existen:
- `product-images` (publico)
- `user-uploads` (privado)
- `ai-results` (privado)

## Scripts

| Comando | Descripcion |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo (Turbopack) |
| `npm run build` | Build de produccion |
| `npm run start` | Servidor de produccion |
| `npm run lint` | ESLint |

## Licencia

Privado
