# Agencia de Turismo · Sitio + Backoffice

Sitio público y panel de gestión white-label para una OTA (Next.js 16, React 19, Tailwind 4, Drizzle ORM, Postgres/Neon, Cloudinary). La marca, contactos y textos de la home se configuran desde el backoffice.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completar AUTH_SECRET y ADMIN_PASSWORD
docker run -d --name travelar-postgres -e POSTGRES_USER=travelar -e POSTGRES_PASSWORD=travelar -e POSTGRES_DB=travelar -p 5433:5432 postgres:16
npm run setup                # crea las tablas y migra el catálogo de WooCommerce
npm run dev                  # http://localhost:3000 · backoffice en /admin
```

> **Windows con antivirus o proxy que inspecciona HTTPS:** si `npm install` falla con `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, ejecutá antes `$env:NODE_OPTIONS="--use-system-ca"` (PowerShell) para que Node use los certificados de Windows.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run db:push` | Sincroniza el esquema (`src/db/schema.ts`) con la base |
| `npm run db:seed` | Borra y recarga destinos, paquetes, salidas, condiciones y datos demo desde `scripts/data/woocommerce-products.json` |
| `npm run db:studio` | Explorador visual de la base (Drizzle Studio) |
| `npm run db:import-sqlite -- --replace` | Copia los datos de la base SQLite vieja (`SQLITE_PATH`, por defecto `data/travelar.db`) a la Postgres de `DATABASE_URL` |
| `node scripts/optimize-media.mjs` | Convierte PNG/JPG de `public/media` a WebP de 1200 px |
| `node scripts/crop-hero.mjs <archivo> <salida>` | Recorta la foto del recuadro de un flyer del sitio viejo |

## Estructura

- `src/app/[locale]` — sitio público en es/en/pt (el español sin prefijo, ver `src/proxy.ts`). Páginas estáticas con ISR (1 h) que se revalidan al instante cuando se edita algo en el backoffice.
- `src/app/admin` — backoffice protegido por sesión (JWT en cookie httpOnly, verificada en `src/proxy.ts` y en cada acción).
- `src/app/api` — webhook de Mercado Pago, crons, PDF de cotizaciones y API v1 con API keys.
- `src/db/schema.ts` — catálogo, reservas, pagos, cotizaciones, contabilidad, emails y conectores.

Más detalle por módulo en `AGENTS.md`.

## Producción (Vercel)

1. **Base de datos:** crear una base en [Neon](https://neon.tech) (está en el Marketplace de Vercel: Storage → Neon, que carga `DATABASE_URL` sola). Desde tu máquina, con `DATABASE_URL` apuntando a Neon: `npm run db:push` para crear las tablas y después `npm run db:import-sqlite -- --replace` para llevar los datos de `data/travelar.db` (o `npm run db:seed` para arrancar con el catálogo de ejemplo).
2. **Archivos:** crear una cuenta en [Cloudinary](https://cloudinary.com) y copiar `CLOUDINARY_URL` (Dashboard → API Keys). Las imágenes subidas desde el admin quedan públicas en Cloudinary; los comprobantes se suben como `authenticated` y solo se ven desde `/admin/comprobantes/*` con sesión.
3. **Variables de entorno:** `DATABASE_URL` (URL pooled de Neon), `AUTH_SECRET` (32+ caracteres), `NEXT_PUBLIC_SITE_URL` (https), `CRON_SECRET` y `CLOUDINARY_URL`. Opcionales: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_PLACES_API_KEY`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_META_PIXEL_ID`. El build lee la base para prerenderizar, así que `DATABASE_URL` tiene que estar disponible también en el build.
4. **Crons** (`vercel.json`): diarios, para que entren en el plan Hobby. En Pro conviene pasar `/api/cron/bookings` a `0 * * * *` y `/api/cron/exchange-rates` a `15 * * * *`.
5. **Después del deploy:** webhook de Mercado Pago a `https://<dominio>/api/webhooks/mercadopago` y dominio verificado en Resend.

## Reseñas de Google

1. En Google Cloud Console creá un proyecto, habilitá **Places API (New)** y generá una API key (restringila a esa API).
2. Cargala en `GOOGLE_PLACES_API_KEY` (`.env.local` en local, variables de entorno en Vercel) y reiniciá el servidor.
3. En `/admin/resenas` buscá el negocio, tocá **Usar este** y se sincronizan el puntaje, la cantidad total y las reseñas.
4. En producción, Vercel Cron llama a `/api/cron/google-reviews` todos los días (ver `vercel.json`); definí `CRON_SECRET`.

Google entrega hasta 5 reseñas por consulta (las más relevantes); se van acumulando en cada sincronización. Desde el admin se elige si mostrar reseñas de Google, manuales o ambas, el puntaje mínimo y cuántas aparecen en la home.

## Datos de ejemplo

- Las fechas de salida migradas eran de 2025: el seed las mueve a la próxima ocurrencia futura y genera fechas para los paquetes sin calendario. **Reemplazar por el calendario real antes de publicar.**
- Las reseñas y las consultas cargadas son de ejemplo.
- Los itinerarios día por día son una plantilla generada a partir de la duración; conviene completarlos desde el backoffice.
