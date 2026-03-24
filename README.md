# ClubVTG

> E-commerce de moda vintage con piezas unicas — cada prenda tiene su propia historia.

## Stack

| Layer       | Technology                          | Role                                    |
| ----------- | ----------------------------------- | --------------------------------------- |
| Framework   | Next.js 16 (App Router, Turbopack)  | SSR, Server Actions, API Routes         |
| Language    | TypeScript 5, React 19              | Type safety, UI                         |
| Styling     | Tailwind CSS 4 + shadcn/ui          | Design system, component library        |
| Auth        | Clerk v7                            | Registration, login, middleware guards  |
| Database    | Supabase (PostgreSQL + RLS)         | Data, Row Level Security, Storage       |
| Payments    | MercadoPago Checkout Pro            | Product & credit payments (ARS)         |
| Emails      | Resend + React Email                | Transactional emails (order receipts)   |
| Validation  | Zod + React Hook Form               | Schema validation, form state           |
| Deploy      | Vercel                              | Hosting (free tier)                     |

## Features

### Tienda

- Catalogo con filtros en 6 dimensiones: categoria, color, precio, talle, condicion y busqueda por texto
- Detalle de producto con galeria de imagenes, talle unico, color con swatch visual y condicion de la prenda
- Cart drawer persistido en localStorage (funciona sin login)
- Modelo single-stock: cada prenda es unica (1 unidad, 1 talle, 1 color)
- Categorias: Tops, Bottoms, Outerwear, Knitwear, Accesorios, Calzado

### Admin Panel

- Dashboard con metricas basicas
- CRUD completo de productos con subida de imagenes a Supabase Storage
- Campos extendidos: subcategoria, marca, condicion, medidas
- Gestion de ordenes con actualizacion de estado y carga de numero de seguimiento

### Checkout

- Integracion MercadoPago Checkout Pro con `binary_mode` (aprobacion instantanea, critico para stock unico)
- Reserva de producto durante el checkout (TTL de 15 minutos)
- Envio via Correo Argentino con tarifa fija configurable
- Webhooks para confirmacion automatica de pagos
- Emails transaccionales de recibo via Resend con templates React Email

### AI Virtual Try-On (Coming Soon — Phase 4)

- Probador virtual por IA: el usuario sube su foto y visualiza como le quedaria la prenda
- Modelo freemium con sistema de creditos (2 gratis al verificar email, packs adicionales de 3/7/15)
- Powered by OpenAI GPT-Image via multi-reference image editing
- Repositorio separado: [try-on-clubvtg](https://github.com/choqooz/try-on-clubvtg)

## Architecture

The project follows a Server Components-first approach with targeted client interactivity:

- **Next.js App Router** with React Server Components for data fetching (e.g., the catalog page fetches products server-side, then delegates filtering to a client component)
- **Server Actions** (`"use server"`) for all mutations — product CRUD, checkout, order updates — each protected by an `requireAdmin()` guard
- **Supabase with RLS policies** for defense-in-depth; admin operations use the service role key server-side
- **Clerk middleware** protects routes (`/checkout`, `/admin/*`, `/orders/*`) at the edge before they render
- **Client-side catalog filtering** — since every item is unique (small inventory), all available products are fetched once and filtered in the browser for instant UX
- **Config split**: `config.ts` (client-safe, importable anywhere) vs `config.server.ts` (uses `import "server-only"` to prevent accidental browser exposure)
- **Zod schemas** shared between server validation and React Hook Form via `@hookform/resolvers`

## Project Structure

```
src/
├── app/
│   ├── page.tsx                        # Landing + catalog (Server Component)
│   ├── product/[slug]/page.tsx         # Product detail
│   ├── sign-in/page.tsx                # Clerk sign-in
│   ├── (shop)/checkout/                # Checkout flow (protected)
│   │   ├── page.tsx                    #   Shipping form + MP redirect
│   │   ├── success/page.tsx            #   Payment confirmed
│   │   ├── failure/page.tsx            #   Payment failed
│   │   └── pending/page.tsx            #   Payment pending
│   ├── admin/                          # Admin panel (protected)
│   │   ├── page.tsx                    #   Dashboard
│   │   ├── products/page.tsx           #   Product list
│   │   ├── products/new/page.tsx       #   Create product
│   │   ├── products/[slug]/edit/       #   Edit product
│   │   └── orders/page.tsx             #   Orders management
│   └── api/
│       ├── webhooks/clerk/route.ts     # Profile creation + credits
│       ├── webhooks/mp/route.ts        # Payment confirmation
│       ├── mp-return/route.ts          # MercadoPago return handler
│       └── upload/route.ts             # Image upload to Storage
├── components/
│   ├── catalog-content.tsx             # Client: product grid + filters
│   ├── catalog-filters.tsx             # Client: 6-dimension filter UI
│   ├── product-card.tsx                # Product card with image, price, badge
│   ├── product-detail-content.tsx      # Full product view with gallery
│   ├── cart-drawer.tsx                 # Slide-over cart
│   ├── checkout-form.tsx               # Shipping + payment form
│   ├── site-header.tsx                 # Nav bar
│   ├── site-footer.tsx                 # Footer
│   ├── category-banner.tsx             # Hero/category banner
│   ├── try-on-section.tsx              # AI try-on placeholder
│   ├── admin/                          # Admin-specific components
│   │   ├── sidebar.tsx                 #   Navigation sidebar
│   │   ├── product-form.tsx            #   Create/edit form
│   │   ├── image-upload.tsx            #   Drag & drop image upload
│   │   └── orders-table.tsx            #   Orders list with status
│   ├── emails/
│   │   └── receipt-email.tsx           # React Email receipt template
│   └── ui/                             # shadcn/ui primitives
├── contexts/
│   └── cart-context.tsx                # Cart state (React Context + localStorage)
├── lib/
│   ├── config.ts                       # Public config (site name, shipping, packs, categories)
│   ├── config.server.ts                # Server-only config (ADMIN_EMAIL)
│   ├── constants.ts                    # Color map, price brackets, conditions
│   ├── types.ts                        # Domain types (synced with DB schema)
│   ├── utils.ts                        # cn() and helpers
│   ├── validations/                    # Zod schemas (product, checkout)
│   ├── actions/                        # Server Actions (product, checkout, orders)
│   └── supabase/                       # Supabase clients (server, admin, types)
├── middleware.ts                        # Clerk route protection
supabase/
└── migrations/                         # SQL migrations (001–006)
```

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project (with Storage enabled)
- Clerk account
- MercadoPago credentials (access token + public key)
- Resend API key (with verified domain)

### Environment Variables

Create a `.env.local` file from the example:

```bash
cp .env.local.example .env.local
```

| Variable                             | Description                                    |
| ------------------------------------ | ---------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`           | Supabase project URL                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`      | Supabase anon/public key                       |
| `SUPABASE_SERVICE_ROLE_KEY`          | Supabase service role key (server-only)        |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`  | Clerk publishable key                          |
| `CLERK_SECRET_KEY`                   | Clerk secret key                               |
| `CLERK_WEBHOOK_SECRET`               | Clerk webhook signing secret                   |
| `ADMIN_EMAIL`                        | Email of the admin user                        |
| `NEXT_PUBLIC_APP_URL`                | Public app URL (e.g. `https://clubvtg.com`)    |
| `MERCADOPAGO_ACCESS_TOKEN`           | MercadoPago access token                       |
| `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` | MercadoPago public key                         |
| `RESEND_API_KEY`                     | Resend API key for transactional emails        |
| `RESEND_FROM_EMAIL`                  | Sender email (e.g. `noreply@clubvtg.com`)      |
| `SHIPPING_FLAT_FEE`                  | Flat shipping fee in ARS (default: `5000`)     |

### Installation

```bash
npm install
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000) with Turbopack.

### Database Setup

Run the Supabase migrations in order against your project:

```
supabase/migrations/
├── 001_initial_schema.sql          # Tables, enums, RPC functions
├── 002_rls_policies.sql            # Row Level Security policies
├── 004_extend_products_schema.sql  # subcategory, brand, condition, measurements
├── 005_orders_schema.sql           # Recreated orders schema
└── 006_drop_color_hex.sql          # Schema cleanup
```

You also need to create the `product-images` storage bucket in Supabase (public read access).

## Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start dev server with Turbopack      |
| `npm run build` | Production build                     |
| `npm run start` | Start production server              |
| `npm run lint`  | Run ESLint                           |

## License

Private. All rights reserved.
