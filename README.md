# ClubVTG

Tienda de ropa vintage argentina con catálogo, compra en pesos argentinos y probador virtual por IA. Incluye un panel administrativo para productos, pedidos y cupones, además de promociones programadas.

## Funcionalidades

### Tienda y cuenta

- Catálogo por categorías, con filtros de talle, marca, color, precio, condición y subcategoría.
- Búsqueda local por coincidencia parcial en título, marca y descripción, sin distinguir mayúsculas. Opera sobre los productos cargados y se combina con los filtros; no utiliza un servicio de búsqueda externo.
- Detalle de producto con galería, navegación por categorías y metadatos SEO.
- Carrito lateral con persistencia en `localStorage` y checkout con datos de envío y tarifa fija configurable.
- MercadoPago Checkout Pro para prendas y créditos, con webhooks y conciliación al regresar del pago. El servidor consulta al proveedor y al estado persistido; los parámetros de retorno no bastan para confirmar una compra.
- Promociones programadas y cotización de cupones sin reservar usos. El cliente elige promociones o cupón, sin combinarlos; el descuento se valida nuevamente al iniciar el pago. Los cupones requieren una cuenta con correo principal verificado.
- Perfil (`/profile`) con créditos e historial del probador, e historial de pedidos (`/orders`).
- Correos transaccionales de compra y despacho mediante Resend.

### Administración (`/admin`)

- Creación y edición de productos, imágenes en Supabase Storage, taxonomía, medidas y estados Disponible / Vendido / Archivado.
- Consulta de pedidos y registro de despacho con número de seguimiento; no permite cambiar arbitrariamente el estado de pago.
- Acciones de servidor para crear, revisar y finalizar anticipadamente promociones por tipo o subtipo de producto.
- Gestión de cupones (`/admin/coupons`): creación, consulta de vigencia y uso, reemplazo y desactivación con motivo.
- Acceso administrativo verificado mediante Clerk y `ADMIN_EMAIL`.

### Probador virtual y créditos

- Foto del usuario y prenda como entrada, moderación de contenido y verificación visual de persona antes de generar.
- Generación con OpenAI, progreso por SSE, visualización ampliada del resultado y reintento ante errores transitorios.
- El código usa `gpt-image-2.5-flare-2026-09-08` por defecto, configurable con `OPENAI_TRYON_MODEL`. Solo envía `input_fidelity: high` al modelo legado `gpt-image-1.5`. Esto describe la configuración del repositorio, no garantiza disponibilidad de los modelos en una cuenta de OpenAI.
- Créditos de bienvenida procesados de forma idempotente por el webhook de Clerk, packs configurables en `/credits` y consumo mediante RPC de Supabase.
- Límite del probador de 5 solicitudes por minuto por usuario con Upstash. Sin ambas credenciales en desarrollo, el limitador permite solicitudes sin aplicar ese límite compartido; en producción exige configuración.

## Stack

| Capa                      | Tecnología                                                           |
| ------------------------- | -------------------------------------------------------------------- |
| Aplicación                | Next.js 16 (Turbopack en desarrollo), React 19 y TypeScript          |
| Autenticación             | Clerk v7                                                             |
| Datos e imágenes          | Supabase (PostgreSQL y Storage)                                      |
| Pagos                     | MercadoPago Checkout Pro                                             |
| IA                        | OpenAI Images, Moderation API y `gpt-4o-mini` para validación visual |
| Correo                    | Resend y React Email                                                 |
| Límites de solicitudes    | Upstash Redis y Ratelimit                                            |
| Interfaz                  | Tailwind CSS v4, shadcn/ui y Radix UI                                |
| Procesamiento de imágenes | Sharp                                                                |
| Observabilidad            | Sentry y PostHog, opcionales                                         |
| Pruebas                   | Vitest, Playwright y pruebas SQL aisladas con Docker                 |

## Requisitos y desarrollo local

- Node.js 22 (ver [.nvmrc](.nvmrc)) y npm.
- Acceso aprobado a Clerk y Supabase. Para los flujos correspondientes: MercadoPago, OpenAI y Resend; Upstash es obligatorio en producción.
- Docker para las pruebas de base de datos y el entorno desechable de promociones y cupones. Las pruebas de navegador utilizan Playwright con Chrome.

### Inicio local

1. Instalar dependencias:

   ```bash
   npm ci
   ```

2. Crear `.env.local` con las variables de las tablas siguientes, usando únicamente credenciales autorizadas para el entorno elegido. No incluir secretos en el repositorio.
3. Confirmar que Supabase tiene el esquema, las RPC, los permisos y los buckets de Storage que requiere esta versión, y que las integraciones externas están configuradas.
4. Iniciar la aplicación:

   ```bash
   npm run dev
   ```

La aplicación queda disponible por defecto en `http://localhost:3000`.

**Instalar dependencias no aprovisiona la tienda.** Ni `npm ci` ni `npm install` crean un proyecto Supabase, aplican su esquema, preparan Storage o configuran Clerk, webhooks, pagos, remitentes de correo ni acceso a modelos de IA.

### Base remota y entorno desechable

- Con credenciales remotas aprobadas, la aplicación local opera contra esa base: no es una copia aislada. No usarla para fixtures, reinicios ni ensayos de migraciones.
- Las migraciones versionadas están en `supabase/migrations/`; su presencia no demuestra que estén aplicadas en un destino remoto.
- Las pruebas SQL y las E2E de promociones/cupones tienen entornos locales desechables específicos. No son un procedimiento de aprovisionamiento de producción.
- Este README no proporciona una receta completa de creación de Supabase, Storage o despliegue. El [preflight de RPC](docs/supabase/rpc-deployed-state-preflight.md) tiene un alcance acotado, y la [guía de promociones y cupones](docs/scheduled-promotions-coupons.md) documenta límites operativos, no un instalador general. Antes de cambios remotos hacen falta verificar el estado desplegado y aprobar el procedimiento correspondiente.

### Orígenes y webhooks

En producción, retornos de pago y webhooks usan `NEXT_PUBLIC_APP_URL`: un origen HTTPS absoluto, sin credenciales, ruta adicional, parámetros ni fragmento; el código rechaza destinos locales y los dominios de túnel previstos en su validación.

`NEXT_PUBLIC_NGROK_URL` solo modifica la base de webhooks en desarrollo; no reemplaza el origen de retorno y se ignora en producción. **Nunca dirigir un webhook de producción a un túnel temporal o una URL local.** Mantener los secretos de firma fuera del repositorio.

## Variables de entorno

“Requerida” indica el flujo que la necesita, no que todas las variables se validen al arrancar. Los secretos sin prefijo `NEXT_PUBLIC_` deben permanecer en el servidor.

### Autenticación y datos

| Variable                            | Requerida              | Descripción                                                                 |
| ----------------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Sí                     | Clave pública de Clerk                                                      |
| `CLERK_SECRET_KEY`                  | Sí                     | Clave de servidor de Clerk                                                  |
| `CLERK_WEBHOOK_SECRET`              | Para webhooks de Clerk | Firma de eventos de sincronización, bienvenida y eliminación de usuarios    |
| `ADMIN_EMAIL`                       | Sí                     | Correo autorizado para administración                                       |
| `NEXT_PUBLIC_SUPABASE_URL`          | Sí                     | URL del proyecto Supabase del entorno elegido                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`     | Sí                     | Clave pública para el cliente Supabase; su acceso depende de permisos y RLS |
| `SUPABASE_SERVICE_ROLE_KEY`         | Sí                     | Clave privilegiada, exclusiva del servidor                                  |

### Pagos y cupones

| Variable                      | Requerida                        | Descripción                                                                                                                    |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `MP_ACCESS_TOKEN`             | Sí                               | Credencial de MercadoPago del entorno elegido                                                                                  |
| `MP_WEBHOOK_SECRET`           | Para webhooks de MercadoPago     | Secreto HMAC; sin él el endpoint no procesa notificaciones, también en desarrollo                                              |
| `COUPON_IDENTITY_HMAC_KEY_V1` | Para cotizar y comprar con cupón | Secreto de servidor para derivar la identidad de uso único desde el correo verificado; no es necesario para checkout sin cupón |
| `NEXT_PUBLIC_APP_URL`         | En producción                    | Origen HTTPS público para retornos y webhooks; en desarrollo usa `http://localhost:3000` si no se define                       |
| `NEXT_PUBLIC_NGROK_URL`       | No; solo desarrollo              | Origen HTTP(S) de un túnel temporal para webhooks, sin ruta, parámetros ni fragmento                                           |

La identidad de cupones solo implementa la versión `v1`. No cambiar su clave como mecanismo de rotación improvisado: puede romper la restricción de un uso. Consultar los límites de rotación y retención en la [guía operativa](docs/scheduled-promotions-coupons.md).

### IA, límites y correo

| Variable                   | Requerida           | Descripción                                                                                                                                                               |
| -------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`           | Para el probador    | Clave con acceso a los modelos utilizados por generación y moderación                                                                                                     |
| `OPENAI_TRYON_MODEL`       | No                  | Modelo de generación; por defecto `gpt-image-2.5-flare-2026-09-08`. El código también acepta `gpt-image-2.5-sunburst-2026-09-08` y `gpt-image-1.5`; rechaza otros valores |
| `UPSTASH_REDIS_REST_URL`   | En producción       | URL de Upstash Redis; configurar junto con el token                                                                                                                       |
| `UPSTASH_REDIS_REST_TOKEN` | En producción       | Token de Upstash Redis; en desarrollo se pueden omitir ambos, sin límite compartido. Definir solo uno causa error                                                         |
| `RESEND_API_KEY`           | Para enviar correos | Clave de Resend                                                                                                                                                           |
| `RESEND_FROM_EMAIL`        | Para enviar correos | Remitente verificado en Resend, por ejemplo `ClubVTG <orders@your-domain.example>`                                                                                        |

La aplicación no sustituye un remitente ausente o inválido por uno de desarrollo.

### Valores configurables de tienda

Los importes son en ARS. Estos son valores predeterminados del código, no precios inmutables.

| Variable                     | Valor predeterminado | Uso                       |
| ---------------------------- | -------------------- | ------------------------- |
| `SHIPPING_FLAT_FEE`          | `5000`               | Tarifa de envío           |
| `CREDIT_PACK_BASIC_AMOUNT`   | `3`                  | Créditos del pack Básico  |
| `CREDIT_PACK_BASIC_PRICE`    | `1500`               | Precio del pack Básico    |
| `CREDIT_PACK_POPULAR_AMOUNT` | `7`                  | Créditos del pack Popular |
| `CREDIT_PACK_POPULAR_PRICE`  | `3000`               | Precio del pack Popular   |
| `CREDIT_PACK_PRO_AMOUNT`     | `15`                 | Créditos del pack Pro     |
| `CREDIT_PACK_PRO_PRICE`      | `5500`               | Precio del pack Pro       |

### Observabilidad opcional

| Variable                   | Requerida                                          | Descripción                                                                                |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SENTRY_DSN`   | No                                                 | Habilita Sentry con muestreo de trazas de `0.1`                                            |
| `SENTRY_AUTH_TOKEN`        | Para subir mapas de código fuente durante el build | Token exclusivo del servidor                                                               |
| `SENTRY_ORG`               | Para esa subida                                    | Identificador de la organización de Sentry                                                 |
| `SENTRY_PROJECT`           | Para esa subida                                    | Identificador del proyecto de Sentry                                                       |
| `NEXT_PUBLIC_POSTHOG_KEY`  | No                                                 | Habilita PostHog; el cliente usa persistencia en memoria y desactiva grabaciones de sesión |
| `NEXT_PUBLIC_POSTHOG_HOST` | No                                                 | Host de PostHog; por defecto `https://eu.i.posthog.com` cuando no se define                |

Sin DSN o clave, la integración correspondiente no se inicializa.

### Pruebas E2E

| Variable                    | Uso                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `E2E_CLERK_USER_EMAIL`      | Usuario dedicado de Clerk de desarrollo, sin pedidos, para E2E autenticadas                                         |
| `PLAYWRIGHT_BASE_URL`       | URL de prueba opcional; las configuraciones generales usan `http://127.0.0.1:3000` por defecto                      |
| `E2E_LOCAL_SUPABASE`        | Debe ser `true` para el entorno desechable de promociones/cupones                                                   |
| `E2E_RESET_LOCAL_SUPABASE`  | Debe ser `true` para autorizar el reinicio de ese entorno desechable                                                |
| `E2E_CLERK_ADMIN_EMAIL`     | Usuario administrador dedicado, distinto del cliente, en la configuración E2E de promociones/cupones                |
| `E2E_LOCAL_PAYMENT_HANDOFF` | Control local de pruebas de checkout; el runner de promociones/cupones lo configura, no es una opción de producción |

Las E2E autenticadas requieren además `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY` de desarrollo. El runner de promociones/cupones usa `http://localhost:4173`, obtiene el administrador desde `ADMIN_EMAIL` y carga la configuración de Clerk desde una ruta fija relativa al checkout. Revisar `scripts/run-promotions-coupons-e2e.mjs` antes de usarlo en otra ubicación; no asumir que basta con exportar variables.

## Scripts y verificaciones

| Comando                               | Descripción                                                               |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `npm run dev`                         | Servidor de desarrollo con Turbopack                                      |
| `npm run build`                       | Compilación de producción                                                 |
| `npm run start`                       | Servidor de producción, después del build                                 |
| `npm run lint`                        | ESLint                                                                    |
| `npm run type-check`                  | TypeScript sin emitir archivos                                            |
| `npm run format`                      | Formatea y **modifica** archivos de `src/` con Prettier; no es un chequeo |
| `npm test`                            | Pruebas unitarias con Vitest                                              |
| `npm run test:database`               | Pruebas SQL y de migraciones aisladas con Docker                          |
| `npm run test:payment-webhook`        | Pruebas enfocadas del procesador de pagos y webhook de MercadoPago        |
| `npm run test:e2e`                    | Pruebas del storefront con Playwright                                     |
| `npm run test:e2e:headed`             | Las mismas pruebas con navegador visible                                  |
| `npm run test:e2e:auth`               | Pruebas autenticadas con Clerk                                            |
| `npm run test:e2e:promotions-coupons` | Recorridos de cliente y administrador con Supabase local desechable       |

El runner de promociones/cupones inicia, reinicia y elimina el estado de la pila local que administra; requiere Docker, acceso a Clerk de desarrollo y las autorizaciones explícitas de la tabla. No ejecutarlo contra una base compartida ni tratarlo como un chequeo sin efectos.

La [CI](.github/workflows/ci.yml) ejecuta lint, comprobación de tipos, pruebas unitarias, contrato de pagos/webhook, build de producción con valores de configuración ficticios y pruebas de base de datos desechable. **No ejecuta Playwright** ni verifica con ese build las integraciones reales de los proveedores.

## Estructura principal

```text
src/
├── app/
│   ├── page.tsx              # Inicio y catálogo
│   ├── (shop)/               # Checkout y pantallas de conciliación
│   ├── admin/                # Productos, pedidos y cupones
│   ├── api/                  # IA, carga de imágenes, webhooks y retornos de pago
│   ├── credits/              # Compra de créditos
│   ├── orders/               # Historial de pedidos
│   ├── product/[slug]/       # Detalle de producto
│   ├── profile/              # Perfil e historial del probador
│   ├── sign-in/              # Autenticación
│   └── try-on/[productSlug]/ # Probador virtual
├── components/               # Interfaz, administración y correos
├── contexts/                 # Estado del carrito
└── lib/                      # Acciones, IA, pagos, clientes y validaciones
supabase/
├── migrations/               # Migraciones SQL versionadas
└── tests/database/           # Pruebas SQL
scripts/                      # Runners de pruebas y fixtures
tests/                        # Pruebas de navegador
docs/                         # Guías específicas
```

## Documentación relacionada

- [Búsqueda del catálogo](docs/storefront-search.md): coincidencias, filtros y navegación.
- [Promociones y cupones](docs/scheduled-promotions-coupons.md): operación, liquidación, privacidad y límites de despliegue.
- [Preflight del estado desplegado de RPC](docs/supabase/rpc-deployed-state-preflight.md): verificación acotada previa al endurecimiento de RPC; no sustituye una auditoría de todas las migraciones.
