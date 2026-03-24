# Technical PRD: ClubVTG — E-Commerce Vintage + AI Try-On

## 1. Visión General

**ClubVTG** es un e-commerce de prendas vintage únicas (una unidad por artículo, un talle, un color). Su diferencial es un **Probador Virtual por IA** que permite al usuario subir su foto y visualizar cómo le quedaría la prenda. El sistema usa un modelo freemium: 2 créditos gratuitos al verificar email, con opción de comprar packs adicionales.

---

## 2. Stack Tecnológico

| Capa | Tecnología | Rol |
|---|---|---|
| Frontend | **Next.js 15** (App Router) + TypeScript | SSR, API Routes, UI (basada en el diseño de `clean-clones-main`) |
| Estilos | **Tailwind CSS 4** + **shadcn/ui** | Sistema de diseño y componentes |
| Autenticación | **Clerk** | Registro, login, verificación de email, sesiones |
| Backend / DB | **Supabase** | PostgreSQL + Row Level Security (RLS) + Storage |
| Pagos | **MercadoPago** | Checkout Pro para productos y créditos (ARS) |
| Cache / Rate Limit | **Upstash** (Redis) | Protección contra abuso de la API de IA |
| Emails | **Resend** | Confirmación de compra, resultados de IA |
| Analíticas | **PostHog** | Tracking de conversiones, uso de IA, comportamiento |
| Errores | **Sentry** | Reporte de errores runtime |
| DNS / Seguridad | **Cloudflare** | DNS, protección DDoS |
| Deploy | **Vercel** | Hosting de Next.js (Free tier) |
| AI Try-On | **OpenAI GPT-Image-1.5** | Generación de imágenes vía `/v1/images/edits` (multi-reference) |

---

## 3. Reglas de Negocio

### 3.1 Inventario: Prenda Única (Single-Stock)

- Cada producto es **1 artículo = 1 talle = 1 color = 1 unidad**.
- El estado (`status`) de un producto puede ser: `available`, `reserved`, `sold`, `archived`.
- Cuando un pago se confirma vía Webhook de MercadoPago → el producto pasa a `sold` **inmediatamente**.
- Un producto `reserved` se mantiene reservado por un tiempo máximo (ej: 15 minutos) durante el proceso de checkout. Si el pago no se completa, vuelve a `available` (vía cron/edge function).
- Los productos `sold` NO aparecen en el catálogo público.

### 3.2 Sistema de Créditos de IA

- **Registro**: Al registrarse un usuario y verificar su email (Clerk) → se crea su perfil en Supabase con `credits = 2`.
- **Consumo**: 1 ejecución del probador virtual = 1 crédito restado.
- **Validación**: Solo usuarios con email verificado pueden usar el probador.
- **Créditos agotados**: Si `credits === 0`, el botón "Probarse" redirige a la pantalla de compra de créditos.
- **Concurrencia**: La operación de descuento de crédito + log de uso debe ser **atómica** (transacción SQL o RPC en Supabase) para evitar race conditions.

### 3.3 Packs de Créditos (Monetización IA)

> **Contexto de costos**: Cada generación de imagen cuesta ~$0.17 USD.
> Con dólar a ~$1.200 ARS, el costo por generación ≈ $204 ARS.

| Pack | Créditos | Precio (ARS) | Costo real (USD) | Margen bruto |
|---|---|---|---|---|
| **Básico** | 3 créditos | $1.500 | $0.51 | ~60% |
| **Popular** | 7 créditos | $3.000 | $1.19 | ~52% |
| **Pro** | 15 créditos | $5.500 | $2.55 | ~45% |

> **Nota**: Los precios son configurables vía variables de entorno. Los márgenes incluyen overhead de Storage, bandwidth y procesamiento. Se recomienda ajustar trimestralmente según tipo de cambio.

### 3.4 Roles y Administración

- **Admin único**: `choqooz@gmail.com`.
- Identificación del admin: vía metadata de Clerk (`publicMetadata.role === 'admin'`) o comparación directa con la env `ADMIN_EMAIL`.
- Solo el admin puede: crear, editar, pausar y eliminar productos; subir imágenes a Supabase Storage; ver todas las órdenes; cargar número de seguimiento.
- Ruta protegida: `/admin/*`.

### 3.5 Logística y Envío

- **Correo Argentino** con **tarifa fija**: $5.000 ARS (configurable vía env).
- El usuario completa sus datos de envío en el checkout: calle, número, piso/depto, ciudad, código postal, provincia.
- El admin carga el `tracking_number` manualmente desde el panel de administración después de despachar.

### 3.6 Moneda

- Todos los precios en **ARS (Pesos Argentinos)**.
- MercadoPago configurado con `currency_id: "ARS"`.

---

## 4. Categorías de Productos

```
tops        → Remeras, Camisas, Musculosas
bottoms     → Pantalones, Shorts, Faldas
outerwear   → Camperas, Abrigos, Blazers
knitwear    → Sweaters, Cardigans
accessories → Cinturones, Gorras, Bufandas, Bolsos
footwear    → Zapatillas, Botas, Sandalias
```

> Las categorías son extensibles. Se almacenan como `text` en la DB (no como enum) para permitir agregar nuevas sin migración.

---

## 5. Esquema de Base de Datos (Supabase SQL)

```sql
-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE product_status AS ENUM ('available', 'reserved', 'sold', 'archived');
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered', 'cancelled');

-- ============================================
-- 1. PERFILES DE USUARIO (sync con Clerk)
-- ============================================
CREATE TABLE profiles (
  id            TEXT PRIMARY KEY,                    -- Clerk user ID (no es UUID de auth.users ya q usamos Clerk)
  email         TEXT UNIQUE NOT NULL,
  full_name     TEXT,
  credits       INTEGER DEFAULT 0 CHECK (credits >= 0),  -- Comienza en 0, se asignan 2 al verificar email
  is_admin      BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. PRODUCTOS VINTAGE (Stock Único)
-- ============================================
CREATE TABLE products (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,                 -- URL amigable
  description   TEXT,
  price         NUMERIC NOT NULL CHECK (price >= 0),
  original_price NUMERIC CHECK (original_price >= 0), -- Precio anterior (para mostrar descuento)
  size          TEXT NOT NULL,                         -- Talle ÚNICO (ej: "M", "42", "Único")
  color         TEXT NOT NULL,                         -- Color ÚNICO
  color_hex     TEXT,                                  -- Hex para swatch visual
  category      TEXT NOT NULL,                         -- tops, bottoms, outerwear, etc.
  image_urls    TEXT[] NOT NULL DEFAULT '{}',           -- Array de URLs de Supabase Storage
  status        product_status DEFAULT 'available',
  reserved_at   TIMESTAMPTZ,                           -- Timestamp de cuándo fue reservado (para TTL)
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_status ON products (status);
CREATE INDEX idx_products_category ON products (category);
CREATE INDEX idx_products_slug ON products (slug);

-- ============================================
-- 3. ÓRDENES
-- ============================================
CREATE TABLE orders (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           TEXT REFERENCES profiles(id) NOT NULL,
  total_amount      NUMERIC NOT NULL,
  shipping_fee      NUMERIC NOT NULL DEFAULT 5000,       -- Tarifa fija configurable
  status            order_status DEFAULT 'pending',
  mp_payment_id     TEXT,                                 -- ID de pago de MercadoPago
  mp_preference_id  TEXT,                                 -- ID de preferencia de MercadoPago
  tracking_number   TEXT,                                 -- Correo Argentino
  shipping_address  JSONB NOT NULL,                       -- { street, number, floor, apartment, city, zip_code, province }
  customer_notes    TEXT,                                  -- Notas opcionales del comprador
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON orders (user_id);
CREATE INDEX idx_orders_status ON orders (status);

-- ============================================
-- 4. ITEMS DE ORDEN (relación order <-> product)
-- ============================================
CREATE TABLE order_items (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id          UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  product_id        UUID REFERENCES products(id) NOT NULL,
  price_at_purchase NUMERIC NOT NULL                      -- Precio snapshot al momento de compra
);

CREATE INDEX idx_order_items_order ON order_items (order_id);

-- ============================================
-- 5. LOGS DE USO DE IA (Probador Virtual)
-- ============================================
CREATE TABLE ai_tryon_logs (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           TEXT REFERENCES profiles(id) NOT NULL,
  product_id        UUID REFERENCES products(id) NOT NULL,
  user_image_url    TEXT NOT NULL,                         -- URL en Storage (bucket: user-uploads)
  result_image_url  TEXT,                                  -- URL resultado (bucket: ai-results)
  status            TEXT DEFAULT 'processing',             -- 'processing', 'success', 'failed'
  error_message     TEXT,                                  -- Si falló, por qué
  credits_charged   INTEGER DEFAULT 1,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_logs_user ON ai_tryon_logs (user_id);

-- ============================================
-- 6. TRANSACCIONES DE CRÉDITOS (auditoría)
-- ============================================
CREATE TABLE credit_transactions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT REFERENCES profiles(id) NOT NULL,
  amount          INTEGER NOT NULL,                        -- Positivo = recarga, Negativo = consumo
  reason          TEXT NOT NULL,                            -- 'registration_bonus', 'pack_purchase', 'ai_tryon', 'refund'
  mp_payment_id   TEXT,                                    -- Si fue compra de pack
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_tx_user ON credit_transactions (user_id);

-- ============================================
-- RPC: Descontar crédito atómicamente
-- ============================================
CREATE OR REPLACE FUNCTION use_ai_credit(p_user_id TEXT, p_product_id UUID, p_user_image_url TEXT)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
  v_credits INTEGER;
BEGIN
  -- Verificar y descontar crédito en una sola operación
  UPDATE profiles
  SET credits = credits - 1, updated_at = NOW()
  WHERE id = p_user_id AND credits > 0
  RETURNING credits INTO v_credits;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  -- Crear log de uso
  INSERT INTO ai_tryon_logs (user_id, product_id, user_image_url, status)
  VALUES (p_user_id, p_product_id, p_user_image_url, 'processing')
  RETURNING id INTO v_log_id;

  -- Registrar transacción de crédito
  INSERT INTO credit_transactions (user_id, amount, reason)
  VALUES (p_user_id, -1, 'ai_tryon');

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RPC: Reembolsar crédito (si la generación falla)
-- ============================================
CREATE OR REPLACE FUNCTION refund_ai_credit(p_log_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user_id TEXT;
BEGIN
  -- Obtener el usuario del log y verificar que no se haya reembolsado ya
  SELECT user_id INTO v_user_id
  FROM ai_tryon_logs
  WHERE id = p_log_id AND status = 'failed' AND credits_charged > 0;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'log_not_found_or_already_refunded';
  END IF;

  -- Reembolsar crédito
  UPDATE profiles SET credits = credits + 1, updated_at = NOW()
  WHERE id = v_user_id;

  -- Marcar como reembolsado
  UPDATE ai_tryon_logs SET credits_charged = 0 WHERE id = p_log_id;

  -- Registrar transacción
  INSERT INTO credit_transactions (user_id, amount, reason)
  VALUES (v_user_id, 1, 'refund');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 5.1 Supabase Storage Buckets

| Bucket | Acceso | Contenido |
|---|---|---|
| `product-images` | Público (lectura) | Fotos de las prendas |
| `user-uploads` | Privado (solo dueño + admin) | Fotos subidas por usuarios para try-on |
| `ai-results` | Privado (solo dueño) | Resultados procesados del try-on |

### 5.2 Row Level Security (RLS)

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | Owner ve la suya | Solo vía webhook | Owner la suya | Nunca |
| `products` | Todos (status = available) | Solo admin | Solo admin | Solo admin |
| `orders` | Owner ve las suyas, admin todas | Owner | Admin (status, tracking) | Nunca |
| `order_items` | Owner ve los suyos | Sistema | Nunca | Nunca |
| `ai_tryon_logs` | Owner ve los suyos | Vía RPC | Vía RPC | Nunca |
| `credit_transactions` | Owner ve las suyas | Vía RPC / webhook | Nunca | Nunca |

---

## 6. Arquitectura de Rutas (Next.js App Router)

### Públicas (sin auth)

| Ruta | Descripción |
|---|---|
| `/` | Landing + catálogo de prendas (`available`) con filtros por categoría |
| `/product/[slug]` | Detalle de prenda: fotos, descripción, talle, color, botón "Agregar al carrito" |
| `/cart` | Carrito de compras (persistido en localStorage para invitados) |

### Protegidas (requiere Clerk auth)

| Ruta | Descripción |
|---|---|
| `/checkout` | Formulario de envío + integración MercadoPago |
| `/checkout/success` | Confirmación de compra exitosa |
| `/checkout/failure` | Manejo de pago fallido |
| `/try-on/[productSlug]` | Probador virtual: subida de foto + resultado IA |
| `/credits` | Compra de packs de créditos |
| `/profile` | Datos del usuario, historial de compras, saldo de créditos |
| `/orders` | Historial de órdenes con tracking |

### Admin (requiere role admin)

| Ruta | Descripción |
|---|---|
| `/admin` | Dashboard: métricas básicas (ventas, productos, créditos vendidos) |
| `/admin/products` | Listado de productos + CRUD |
| `/admin/products/new` | Formulario de carga de nueva prenda + subida de fotos a Storage |
| `/admin/products/[id]/edit` | Edición de prenda existente |
| `/admin/orders` | Listado de órdenes pagadas + campo para cargar `tracking_number` |

### API Routes (Server-side)

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/webhooks/clerk` | POST | Crea perfil en Supabase al registro; asigna 2 créditos al verificar email |
| `/api/webhooks/mercadopago` | POST | Procesa notificaciones de pago: actualiza orden → marca producto como `sold` → envía email vía Resend |
| `/api/checkout/create-preference` | POST | Crea preferencia de MercadoPago (productos o créditos) |
| `/api/ai/process` | POST | Valida créditos (vía RPC) → sube foto a Storage → llama a API IA → guarda resultado |
| `/api/products` | GET | Catálogo público (products con status = available) |
| `/api/admin/products` | CRUD | Gestión de productos (protegido por role admin) |

---

## 7. Flujos de Integración

### 7.1 Registro y Créditos Iniciales

```
1. Usuario se registra en Clerk
2. Clerk dispara Webhook → POST /api/webhooks/clerk
3. El endpoint crea fila en `profiles` con credits = 0
4. Cuando el usuario verifica su email → Clerk dispara otro webhook (event: user.updated)
5. El endpoint detecta email_verified = true → UPDATE profiles SET credits = 2
6. Se registra en credit_transactions: { amount: 2, reason: 'registration_bonus' }
```

### 7.2 Checkout de Producto

```
1. Usuario agrega prenda al carrito (localStorage)
2. Va a /checkout → completa datos de envío
3. Frontend → POST /api/checkout/create-preference
   → El server reserva el producto (status = 'reserved', reserved_at = NOW())
   → Crea preferencia en MercadoPago con external_reference = order_id
   → Retorna init_point (URL de pago)
4. Usuario paga en MercadoPago
5. MercadoPago → POST /api/webhooks/mercadopago (event: payment.approved)
   → UPDATE order SET status = 'paid'
   → UPDATE product SET status = 'sold'
   → Enviar email de confirmación vía Resend
6. Si el pago no se completa en 15 min → Cron/Edge Function libera la reserva
   → UPDATE product SET status = 'available', reserved_at = NULL WHERE status = 'reserved' AND reserved_at < NOW() - INTERVAL '15 minutes'
```

### 7.3 AI Try-On (Probador Virtual)

**Repositorio**: https://github.com/choqooz/try-on-clubvtg  
**Modelo**: OpenAI GPT-Image-1.5 → endpoint `/v1/images/edits` con múltiples imágenes de referencia (foto del usuario + foto de la prenda).  
**Requisito**: La cuenta de OpenAI debe tener **API Organization Verification** habilitada.  
**Respuesta**: Streaming progresivo vía **SSE** (Server-Sent Events), procesamiento de imágenes server-side con `sharp`.

```
1. Usuario va a /try-on/[productSlug] (requiere auth + email verificado)
2. Sube su foto (frente, cuerpo completo, buena iluminación)
3. Frontend → POST /api/ai/process { productId, userImage }
   → El server responde con SSE stream para mostrar progreso en tiempo real
4. Server:
   a. Verifica credits > 0 vía Upstash rate limit (userId)
   b. Valida y redimensiona la imagen con sharp (server-side)
   c. Sube imagen a Supabase Storage (bucket: user-uploads)
   d. Llama RPC use_ai_credit() → descuenta 1 crédito + crea log atómicamente
   e. Llama OpenAI /v1/images/edits con:
      - image[]: [user_image, product_image]  (multi-reference)
      - model: "gpt-image-1.5"
      - prompt: (desde lib/prompts.ts del repo try-on)
   f. Guarda resultado en Storage (bucket: ai-results)
   g. UPDATE ai_tryon_logs SET result_image_url, status = 'success'
   h. Emite SSE event con la URL del resultado
5. Frontend muestra before/after con ResultViewer
6. Si falla:
   → Emite SSE event de error
   → UPDATE ai_tryon_logs SET status = 'failed'
   → Reembolsa 1 crédito (INSERT credit_transactions { amount: 1, reason: 'refund' })
```

> **Integración**: El proyecto `try-on-clubvtg` ya tiene implementado el flujo completo con mock catalog. Para acoplar al e-commerce, reemplazar `lib/garments.ts` con llamadas a la API de Supabase y agregar el sistema de créditos + auth de Clerk.

### 7.4 Compra de Créditos

```
1. Usuario va a /credits → selecciona pack
2. Frontend → POST /api/checkout/create-preference (type: 'credits', pack_id)
3. MercadoPago → Webhook → payment.approved
   → UPDATE profiles SET credits = credits + pack_amount
   → INSERT credit_transactions { amount: pack_amount, reason: 'pack_purchase', mp_payment_id }
```

---

## 8. Variables de Entorno

```bash
# ── Supabase ──
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# ── Clerk ──
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

# ── MercadoPago ──
MERCADOPAGO_ACCESS_TOKEN=
NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY=

# ── Resend ──
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@clubvtg.com

# ── Upstash Redis ──
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# ── PostHog ──
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

# ── Sentry ──
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=

# ── Configuración de Negocio ──
ADMIN_EMAIL=choqooz@gmail.com
SHIPPING_FLAT_FEE=5000
CREDIT_PACK_BASIC_AMOUNT=3
CREDIT_PACK_BASIC_PRICE=1500
CREDIT_PACK_POPULAR_AMOUNT=7
CREDIT_PACK_POPULAR_PRICE=3000
CREDIT_PACK_PRO_AMOUNT=15
CREDIT_PACK_PRO_PRICE=5500

# ── App ──
NEXT_PUBLIC_APP_URL=https://clubvtg.com

# ── IA + Try-On (Iteración 2) ──
OPENAI_API_KEY=
# Modelo GPT-Image-1.5 - requiere verificación de organización en OpenAI
OPENAI_TRYON_MODEL=gpt-image-1.5
# Repositorio: https://github.com/choqooz/try-on-clubvtg
```

---

## 9. Referencia de UI

### 9.1 Frontend estático (diseño visual)

El archivo `clean-clones-main/` es una **plantilla de referencia de UI únicamente**. Elementos a preservar:

- **Estética**: Minimalismo vintage, tipografía serif + sans-serif, paleta neutra
- **Componentes clave**: `SiteHeader`, `ProductCard`, `CartDrawer`, `TryOnSection`, `LoginModal`, `SiteFooter`, `CategoryBanner`
- **Design system**: shadcn/ui + Tailwind CSS 4
- **Interacciones**: Drawer del carrito, modal de login, filtros por categoría
- **Responsive**: Mobile-first

> **Importante**: El modelo de datos, routing, y lógica del template estático se **descarta completamente**. Solo se migra el look & feel.

### 9.2 Componentes del Try-On (repositorio externo)

Del repo `try-on-clubvtg`, los componentes UI a adaptar e integrar:

| Componente | Rol |
|---|---|
| `GarmentTryOnSection` | Orquestador principal: upload + SSE + resultado |
| `ImageUploader` | Subida de foto del usuario + resize client-side |
| `ResultViewer` | Visualización before/after del resultado generado |

> Estos componentes están construidos con Next.js 15 + React 19 + Tailwind v4 (mismo stack objetivo), por lo que la integración es directa.

---

## 10. Roadmap de Implementación (Fases)

### Fase 1: Fundación
- [ ] Inicializar proyecto Next.js + TypeScript + Tailwind + shadcn/ui
- [ ] Configurar Clerk (auth)
- [ ] Configurar Supabase (schema, RLS, Storage buckets)
- [ ] Webhook de Clerk → creación de perfil + créditos
- [ ] Migrar UI del template estático

### Fase 2: Catálogo + Admin
- [ ] CRUD de productos (panel admin)
- [ ] Subida de imágenes a Supabase Storage
- [ ] Catálogo público con filtros por categoría
- [ ] Detalle de producto con slug

### Fase 3: Carrito + Checkout + Pagos
- [ ] Carrito (localStorage para invitados, sync post-login)
- [ ] Checkout con formulario de envío (Correo Argentino)
- [ ] Integración MercadoPago (Checkout Pro)
- [ ] Webhook de MercadoPago → confirmar pago → marcar como vendido
- [ ] Emails transaccionales (Resend)

### Fase 4: AI Try-On + Créditos
- [ ] Página de compra de packs de créditos
- [ ] Webhook de créditos (MercadoPago → sumar créditos)
- [ ] Interfaz de Try-On (subida de foto + resultado)
- [ ] Integración con API de IA (OpenAI — proyecto externo)
- [ ] Rate limiting con Upstash

### Fase 5: Observabilidad + Deploy
- [ ] Sentry para error tracking
- [ ] PostHog para analíticas y conversiones
- [ ] Cloudflare DNS
- [ ] Deploy en Vercel
- [ ] Testing E2E de flujos críticos (checkout, créditos, try-on)

---

## 11. Referencia de APIs Externas

> Esta sección documenta las APIs y SDKs de cada servicio del stack, con snippets de configuración relevantes al proyecto ClubVTG.

---

### 11.1 Clerk — Autenticación

**Docs**: https://clerk.com/docs  
**Paquetes**:

```bash
npm install @clerk/nextjs svix
```

**Configuración (`middleware.ts`)**:

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isProtectedRoute = createRouteMatcher([
  '/checkout(.*)',
  '/try-on(.*)',
  '/credits(.*)',
  '/profile(.*)',
  '/orders(.*)',
  '/admin(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)'],
}
```

**Webhook Handler (`app/api/webhooks/clerk/route.ts`)**:

```typescript
import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET!

  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Missing svix headers', { status: 400 })
  }

  const payload = await req.json()
  const body = JSON.stringify(payload)

  const wh = new Webhook(WEBHOOK_SECRET)
  let evt: WebhookEvent

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch (err) {
    return new Response('Webhook verification failed', { status: 400 })
  }

  // Eventos relevantes para ClubVTG:
  // - user.created → Crear perfil en Supabase con credits = 0
  // - user.updated → Detectar email_verified → asignar 2 créditos
  // - user.deleted → Soft delete del perfil

  return new Response('OK', { status: 200 })
}
```

**Integración Clerk + Supabase (RLS con JWT)**:

Clerk puede emitir un JWT customizado para Supabase. Configurar en el Dashboard de Clerk:
- Template name: `supabase`
- Claims: `{ "sub": "{{user.id}}", "email": "{{user.primary_email_address}}" }`

```sql
-- En Supabase, usar el JWT de Clerk para RLS
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.jwt()->>'sub');
```

> **Nota**: Como usamos Clerk (NO Supabase Auth), el campo `profiles.id` es de tipo `TEXT` (Clerk user ID), no `UUID`. Las operaciones de escritura sensibles se hacen server-side con el `SUPABASE_SERVICE_ROLE_KEY`.

---

### 11.2 Supabase — Backend / DB / Storage

**Docs**: https://supabase.com/docs  
**Paquetes**:

```bash
npm install @supabase/supabase-js @supabase/ssr
```

**Cliente Server-Side (`lib/supabase/server.ts`)**:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignorar en Server Components
          }
        },
      },
    }
  )
}
```

**Cliente Admin (Service Role — solo server-side)**:

```typescript
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
```

**Llamar RPC desde el server**:

```typescript
const { data, error } = await supabaseAdmin.rpc('use_ai_credit', {
  p_user_id: clerkUserId,
  p_product_id: productId,
  p_user_image_url: uploadedUrl,
})
```

**Subir a Storage**:

```typescript
const { data, error } = await supabaseAdmin.storage
  .from('user-uploads')
  .upload(`${userId}/${fileName}`, fileBuffer, {
    contentType: 'image/jpeg',
    upsert: false,
  })

// Obtener URL pública (solo para buckets públicos como product-images)
const { data: { publicUrl } } = supabaseAdmin.storage
  .from('product-images')
  .getPublicUrl(filePath)

// Obtener URL firmada (para buckets privados como user-uploads y ai-results)
const { data: { signedUrl } } = await supabaseAdmin.storage
  .from('ai-results')
  .createSignedUrl(filePath, 3600) // 1 hora de validez
```

---

### 11.3 MercadoPago — Pagos

**Docs**: https://www.mercadopago.com.ar/developers/es/docs  
**Paquete**:

```bash
npm install mercadopago
```

**Configuración del SDK (v2)**:

```typescript
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN!,
})
```

**Crear Preferencia de Checkout (`app/api/checkout/create-preference/route.ts`)**:

```typescript
import { Preference } from 'mercadopago'

const preference = new Preference(mpClient)

const result = await preference.create({
  body: {
    // ── Items (campos requeridos por el quality checklist) ──
    items: [
      {
        id: product.id,                    // item_id ✓
        title: product.name,               // item_title ✓
        description: product.description,  // item_description ✓
        category_id: 'clothing',           // item_category_id ✓ (categoría MercadoPago para ropa)
        quantity: 1,                       // item_quantity ✓
        unit_price: Number(product.price), // item_unit_price ✓
        currency_id: 'ARS',
        picture_url: product.image_urls[0],
      },
      {
        id: 'shipping',
        title: 'Envío - Correo Argentino',
        quantity: 1,
        unit_price: Number(process.env.SHIPPING_FLAT_FEE),
        currency_id: 'ARS',
      },
    ],

    // ── Datos del comprador (mejoran tasa de aprobación) ──
    payer: {
      email: user.email,                   // payer.email ✓
      first_name: user.firstName,          // payer.first_name ✓
      last_name: user.lastName,            // payer.last_name ✓
      address: {                           // payer.address ✓
        street_name: shippingAddress.street,
        street_number: shippingAddress.number,
        zip_code: shippingAddress.zip_code,
      },
      // identification: { type: 'DNI', number: '...' } // opcional si el usuario lo provee
    },

    // ── Conciliación y notificaciones ──
    external_reference: orderId,           // external_reference ✓ (order.id de Supabase)
    notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/mercadopago`, // webhooks_ipn ✓
    statement_descriptor: 'CLUBVTG',       // statement_descriptor ✓ (aparece en resumen de tarjeta)

    // ── Redirección post-pago ──
    back_urls: {                           // back_urls ✓
      success: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/success`,
      failure: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/failure`,
      pending: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/pending`,
    },
    auto_return: 'approved',

    // ── Configuración de negocio ──
    binary_mode: true,                     // CRÍTICO: aprobación instantánea (necesario para stock único)
    // Expirar la preferencia en sync con el TTL de reserva del producto (15 min)
    expires: true,
    expiration_date_from: new Date().toISOString(),
    expiration_date_to: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  },
})

return Response.json({ init_point: result.init_point })
```

**Webhook de Pago (`app/api/webhooks/mercadopago/route.ts`)**:

```typescript
import { Payment } from 'mercadopago'

export async function POST(req: Request) {
  const body = await req.json()

  // MercadoPago envía notificaciones con type y data.id
  if (body.type === 'payment') {
    const payment = new Payment(mpClient)
    const paymentData = await payment.get({ id: body.data.id }) // payment_get_or_search_api ✓

    if (paymentData.status === 'approved') {
      const orderId = paymentData.external_reference

      // 1. Actualizar orden → status = 'paid', mp_payment_id = paymentData.id
      // 2. Actualizar producto(s) → status = 'sold'
      // 3. Enviar email de confirmación vía Resend
    }

    // Manejar otros estados (pending, rejected) para UX adecuada
    if (paymentData.status === 'rejected') {
      // Liberar reserva del producto → status = 'available'
    }
  }

  return new Response('OK', { status: 200 })
}
```

> **Clave**: El `external_reference` vincula el `payment_id` de MP con el `order.id` de Supabase.  
> **`binary_mode: true`**: Para ClubVTG es OBLIGATORIO — evita estados "pending" en stock único.  
> **`expires`**: Sincronizar el vencimiento de la preferencia con el TTL de reserva del producto (15 min).

### MercadoPago MCP (Tooling disponible)

El MCP de MercadoPago está disponible en el entorno de desarrollo y provee herramientas para facilitar la integración:

| Herramienta | Descripción |
|---|---|
| `application_list` | Lista las apps disponibles |
| `create_test_user` | Crea usuarios de prueba (buyer/seller) para testear flujos de pago |
| `add_money_test_user` | Carga saldo a usuarios de prueba |
| `quality_checklist` | Valida que la preferencia cumple todos los campos requeridos por MP |
| `quality_evaluation` | Evalúa la calidad de una integración dado un `payment_id` |
| `save_webhook` | Configura la URL de webhook para notificaciones |
| `notifications_history` | Analiza el historial de webhooks para diagnosticar problemas de entrega |
| `search_documentation` | Busca en la documentación oficial de MP |

**App ID de la integración**: `7266291536415255`

> **Testing**: Antes del go-live, usar `create_test_user` para crear un buyer y un seller de prueba y validar el flujo completo de pago. Luego usar `quality_evaluation` con el `payment_id` generado para verificar que la integración cumple los estándares de MP.

---

### 11.4 Resend — Emails Transaccionales

**Docs**: https://resend.com/docs  
**Paquetes**:

```bash
npm install resend
npm install -D react-email @react-email/components
```

**Enviar email desde API route**:

```typescript
import { Resend } from 'resend'
import { OrderConfirmationEmail } from '@/emails/order-confirmation'

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function sendOrderConfirmation(order: Order & { profile: Profile }, product: Product) {
  const { data, error } = await resend.emails.send({
    from: `ClubVTG <${process.env.RESEND_FROM_EMAIL}>`,
    to: [order.profile.email],  // Email viene del profile (JOIN con profiles)
    subject: `Orden confirmada #${order.id.slice(0, 8)}`,
    react: OrderConfirmationEmail({
      orderNumber: order.id,
      productName: product.name,
      total: order.total_amount + order.shipping_fee,
    }),
  })

  if (error) throw new Error(`Failed to send email: ${error.message}`)
  return data
}
```

**Template con React Email (`emails/order-confirmation.tsx`)**:

```tsx
import { Html, Head, Body, Container, Text, Heading } from '@react-email/components'

interface Props {
  orderNumber: string
  productName: string
  total: number
}

export function OrderConfirmationEmail({ orderNumber, productName, total }: Props) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container>
          <Heading>¡Gracias por tu compra!</Heading>
          <Text>Orden: #{orderNumber}</Text>
          <Text>Producto: {productName}</Text>
          <Text>Total: ${total.toLocaleString('es-AR')} ARS</Text>
          <Text>Te enviaremos el número de seguimiento cuando despachemos.</Text>
        </Container>
      </Body>
    </Html>
  )
}
```

> **Emails a enviar**: Confirmación de compra, resultado de AI Try-On, despacho con tracking.  
> **Dominio**: Configurar dominio personalizado en Resend Dashboard para evitar spam.

---

### 11.5 Upstash — Rate Limiting (Redis)

**Docs**: https://upstash.com/docs/redis  
**Paquetes**:

```bash
npm install @upstash/redis @upstash/ratelimit
```

**Configuración de Rate Limiter para IA**:

```typescript
import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

const redis = Redis.fromEnv()

// Limitar uso de IA: máximo 5 requests por usuario por minuto
// (además del sistema de créditos, esto previene spam/abuso)
export const aiRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: 'ratelimit:ai',
  analytics: true,
})

// Uso en el endpoint de IA
export async function POST(req: NextRequest) {
  const userId = auth().userId
  const { success, remaining } = await aiRatelimit.limit(userId)

  if (!success) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Intentá de nuevo en un minuto.' },
      { status: 429 }
    )
  }

  // Continuar con el procesamiento...
}
```

> **Doble protección**: Upstash rate limit (contra spam/abuso rápido) + créditos en DB (contra agotamiento de recursos pagos).

---

### 11.6 PostHog — Analíticas

**Docs**: https://posthog.com/docs  
**Paquete**:

```bash
npm install posthog-js posthog-node
```

**Provider (`app/providers.tsx`)**:

```typescript
'use client'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect } from 'react'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      capture_pageview: true,
      capture_pageleave: true,
    })
  }, [])

  return <PHProvider client={posthog}>{children}</PHProvider>
}
```

**Eventos a trackear en ClubVTG**:

```typescript
// Producto visto
posthog.capture('product_viewed', { product_id, category, price })

// Agregado al carrito
posthog.capture('product_added_to_cart', { product_id, price })

// Checkout iniciado
posthog.capture('checkout_started', { order_id, total_amount })

// Compra completada
posthog.capture('purchase_completed', { order_id, total_amount, product_count })

// IA Try-On usado
posthog.capture('tryon_generated', { product_id, credits_remaining })

// Pack de créditos comprado
posthog.capture('credits_purchased', { pack_name, credits_amount, price })
```

---

### 11.7 Sentry — Error Tracking

**Docs**: https://docs.sentry.io/platforms/javascript/guides/nextjs  
**Setup (wizard automático)**:

```bash
npx @sentry/wizard@latest -i nextjs
```

El wizard crea automáticamente:
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `instrumentation.ts`
- Actualiza `next.config.js` con `withSentryConfig`

**Configuración manual mínima (`sentry.client.config.ts`)**:

```typescript
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration(),
  ],
})
```

> **Tip**: Usar `Sentry.captureException(error)` en los catch blocks de webhooks y procesamiento de IA para debugging.

---

### 11.8 Cloudflare — DNS

**Docs**: https://developers.cloudflare.com/dns

**Configuración requerida**:

1. Registrar el dominio (ej: `clubvtg.com`) en Cloudflare
2. Apuntar los nameservers del registrador a Cloudflare
3. Crear registros DNS:

| Tipo | Nombre | Contenido | Proxy |
|---|---|---|---|
| `CNAME` | `@` | `cname.vercel-dns.com` | DNS only (sin proxy) |
| `CNAME` | `www` | `cname.vercel-dns.com` | DNS only |

> **Importante**: Para Vercel, los registros CNAME deben estar en modo **DNS only** (nube gris), NO proxied (nube naranja). Esto es porque Vercel maneja su propio SSL/TLS.

4. En Vercel: agregar el dominio en Project Settings → Domains → verificar.

---

### 11.9 Resumen de Paquetes (dependencies)

```json
{
  "dependencies": {
    "next": "^15",
    "react": "^19",
    "react-dom": "^19",
    "@clerk/nextjs": "^6",
    "@supabase/supabase-js": "^2",
    "@supabase/ssr": "^0.5",
    "mercadopago": "^2",
    "resend": "^4",
    "@upstash/redis": "^1",
    "@upstash/ratelimit": "^2",
    "posthog-js": "^1",
    "posthog-node": "^4",
    "@sentry/nextjs": "^8",
    "svix": "^1",
    "sharp": "^0.33",
    "tailwindcss": "^4",
    "class-variance-authority": "^0.7",
    "clsx": "^2",
    "tailwind-merge": "^2",
    "lucide-react": "^0.460",
    "zod": "^3"
  },
  "devDependencies": {
    "typescript": "^5.7",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "react-email": "^3",
    "@react-email/components": "^0.0.30"
  }
}
```

> **Nota**: Las versiones son indicativas. Usar `npm install` con los nombres de paquete para obtener las últimas versiones estables.
