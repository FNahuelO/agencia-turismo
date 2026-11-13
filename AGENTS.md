# AGENTS.md · Contexto para agentes

Responder siempre en español. Commits en español.

## Objetivo

Convertir el sitio de TravelAr en una OTA con las funciones de la white label de Savia ([OTA](https://www.saviaweb.com.ar/ota-venta-de-viajes-online/), [backoffice](https://www.saviaweb.com.ar/)). El usuario eligió hacerlo **por etapas, un módulo por vez**, y mostrar cada uno antes de seguir.

**Ahorro de tokens:** no levantar navegadores ni subagentes de browser, y no renderizar páginas con curl salvo pedido explícito. Verificar con `npx tsc --noEmit` y con scripts `tsx` contra una copia de la base (ver "Cómo testear").

## Stack y convenciones

- Next.js 16 (App Router, `proxy.ts` en lugar de middleware, `PageProps<"/ruta">` y `RouteContext<>` tipados), React 19, Tailwind 4 (utilidades `btn-*`, `field`, `label`, `eyebrow`, `container-x` en `globals.css`), Drizzle ORM con Postgres (`pg`; Docker local en el puerto 5433, Neon en prod), Cloudinary para archivos subidos y zod 4. En Postgres, `sum`/`count` en `sql<number>` vuelven como string: usar `.mapWith(Number)`; para búsquedas, `ilike`.
- Mutaciones: server actions validadas con zod. Del lado admin se devuelve `FormState` (`{error?, ok?}`) y se usa `ActionForm`, `SubmitButton`, `ConfirmButton` y `AutoSubmitSelect` de `src/components/admin/client.tsx`. La UI del admin está en `src/components/admin/ui.tsx` (`PageHeader`, `Card`, `Field`, `Badge`, metadatos de estados).
- Settings clave/valor: `src/lib/settings.ts` (`SETTINGS_DEFAULTS` + `SETTINGS_LABELS`). Los grupos se muestran en `admin/(panel)/configuracion/page.tsx` (`GROUPS`).
- Después de mutar se llama a `revalidatePath("/", "layout")`, porque el sitio usa ISR de 1 h.
- No exportar helpers de lectura desde archivos `"use server"`, porque quedan expuestos como endpoints. Van en `src/lib`.
- En formularios cliente con `useActionState` donde no hay que perder lo tipeado, usar `onSubmit` + `startTransition(() => action(fd))`, ya que React 19 resetea el `<form action>`.

## Diseño del sitio público

Se pasó el filtro de la skill [Anti-AI-UI](https://github.com/Vanszs/Anti-AI-UI) (Anti-AI-Slop). Al tocar el sitio, mantener:
- Escala de radios: campos `rounded-md`, botones y tarjetas chicas `rounded-lg`, tarjetas grandes e imágenes `rounded-xl`. `rounded-full` solo para avatares y el botón flotante.
- Títulos con `font-bold` (no `font-extrabold`). `eyebrow` es texto chico en `lake`, sin mayúsculas ni tracking.
- Un CTA dominante por sección; el secundario como link (`link-arrow`).
- Sin `scale-105` ni sombras grandes en hover: cambio de opacidad, borde o `shadow-md`, ≤200 ms. `prefers-reduced-motion` está cubierto globalmente en `globals.css`.
- Header sólido, sin `backdrop-blur`. Evitar grillas de 3 tarjetas iguales con ícono en cuadrado.

## Entorno local (Linux)

- `node_modules` venía instalado desde Windows, con binarios `win32` de esbuild, libsql y sharp. Se reinstaló con `npm ci` y ahora funciona. Si vuelve a fallar con "esbuild for another platform", hay que reinstalar.
- Comandos: `npx tsc --noEmit`, `npx next typegen` (genera los tipos de rutas nuevas antes del typecheck), `npx drizzle-kit push` (aplica el esquema) y `npm run dev -- -p 3005`.
- Postgres local: contenedor `travelar-postgres` (`docker start travelar-postgres`), URL `postgres://travelar:travelar@localhost:5433/travelar`. No usar el `taskflow-postgres` del puerto 5432, que es de otro proyecto.
- La base SQLite vieja (`data/travelar.db` y los backups `data/travelar.db.bak-*`) quedó fuera de git y solo sirve como origen para `npm run db:import-sqlite -- --replace` (`scripts/migrate-sqlite-to-pg.ts`, que convierte timestamps, booleanos y JSON y ajusta las secuencias).
- La base real **no tiene reservas**. En producción (Neon), preferir migraciones revisadas (`drizzle-kit generate` + `migrate`) antes que `push --force`.
- Archivos (`lib/storage.ts`): con `CLOUDINARY_URL`, las imágenes se suben públicas (se guarda la URL de Cloudinary) y los comprobantes como `authenticated` (los PDF como `raw`), y `/admin/comprobantes/[file]` los baja con URL firmada. Sin esa variable se usa el disco en `data/uploads` y `data/receipts`.

### Cómo testear barato

```bash
export PGPASSWORD=travelar T=postgres://travelar:travelar@localhost:5433/travelar_test
psql -h localhost -p 5433 -U travelar -d travelar -c "drop database if exists travelar_test" -c "create database travelar_test"
DATABASE_URL=$T npx drizzle-kit push --force && DATABASE_URL=$T npx tsx scripts/migrate-sqlite-to-pg.ts
# escribir scripts/_tmp-x.ts (usa alias @/..., terminar con `await pool.end()`), correr y borrar:
DATABASE_URL=$T RESEND_API_KEY= npx tsx scripts/_tmp-x.ts && rm scripts/_tmp-x.ts
```

Para generar una cookie de sesión admin desde un script: `signSession` y `SESSION_COOKIE` de `src/lib/session.ts`, con `.env.local` cargado.

## Estado por módulo

| # | Módulo | Estado |
|---|--------|--------|
| 1 | Reservas online + checkout (Mercado Pago + transferencia) + panel de reservas | **Hecho** (falta probar Mercado Pago real) |
| 2 | Multimoneda con cotización desde el backoffice | **Hecho** |
| 3 | Multilenguaje ES/EN/PT | **Hecho** |
| 4 | Cotizador / armado de itinerarios con PDF | **Hecho** |
| 5 | Portal B2B / B2B2C para agencias revendedoras | **Descartado** (el usuario no lo va a hacer) |
| 6 | Productos propios: actividades, hoteles, traslados | **Hecho** |
| 7 | API propia con API keys | **Hecho** |
| 8 | Contabilidad básica: cobros, saldos, proveedores, caja | **Hecho** |
| 9 | Emails transaccionales (Resend) + avisos internos por email | **Hecho** (sin bot: el usuario eligió solo email) |
| 10 | Capa de conectores a proveedores externos (GDS/hoteles) con proveedor mock | **Hecho** (solo el simulado; los reales necesitan contrato) |

### Módulo 1: qué se hizo

- **Esquema** (`src/db/schema.ts`): tablas `bookings` (code `TA-XXXXXX`, `accessToken`, status `pendiente|confirmada|pagada|cancelada|vencida`, montos en enteros, `expiresAt` y `balanceDueDate`), `booking_passengers`, `payments` (method `mercadopago|transferencia|efectivo`, status `pendiente|en_revision|aprobado|rechazado|reintegrado`, `externalId` único) y `booking_events` (level `info|alerta`, `resolved`).
- **`src/lib/pricing.ts`**: `quoteBooking`, una función pura que se usa en el cliente y en el servidor. La seña sale del % de la política (30% por defecto) y el recargo single solo aplica con 1 pasajero.
- **`src/lib/bookings.ts`**:
  - `reserveSeats` y `releaseSeats` usan un UPDATE atómico con la condición de cupo. Los bebés no ocupan lugar.
  - `recalcBooking` suma los pagos aprobados para fijar el estado. Si llega un pago tardío a una reserva vencida, intenta recuperar los lugares.
  - `expireBookings` vence las reservas pendientes sin pagos aprobados ni en revisión.
  - También están `getBookingForCustomer` (compara el token en tiempo constante), `amountDue` y `bookingUrl`.
- **`src/lib/mercadopago.ts`**: Checkout Pro con `fetch` directo, sin SDK.
  - `createCheckoutPreference` usa el código de reserva como `external_reference`. `auto_return` y `notification_url` solo se envían si `NEXT_PUBLIC_SITE_URL` es https.
  - `syncMercadoPagoPayment` es idempotente.
  - `verifyWebhookSignature` valida `x-signature` con HMAC.
  - Mercado Pago solo funciona con paquetes en ARS; los paquetes en USD quedan solo con transferencia hasta el módulo 2.
- **Rutas públicas**:
  - `/reservar/[slug]?salida=ID` es el checkout (`components/site/booking-form.tsx`).
  - `/reserva/[code]?t=TOKEN` muestra estado, pago de seña o saldo con Mercado Pago, datos bancarios y subida de comprobante. Al volver de Mercado Pago con `payment_id`, sincroniza el pago.
  - Las acciones están en `app/[locale]/reservar/actions.ts` (`createBooking`, `payBooking`, `uploadReceipt`). Al reservar también se crea un lead con estado "reservado".
- **API**:
  - `/api/webhooks/mercadopago` (POST).
  - `/api/cron/bookings` vence reservas cada hora (Bearer `CRON_SECRET`, configurado en `vercel.json`). En el plan Hobby de Vercel los crons son diarios.
- **Comprobantes**: se guardan en `data/receipts` (privado) mediante `saveReceiptUpload` en `lib/storage.ts`, y se sirven en `/admin/comprobantes/[file]` solo con sesión.
- **Admin**:
  - `/admin/reservas` tiene alertas (comprobantes para revisar, alertas sin resolver, reservas que vencen en 12 h), carga manual de reservas de oficina, filtros y tabla.
  - `/admin/reservas/[id]` permite gestionar pagos (registrar, aprobar o rechazar, reintegrar), pasajeros, titular y notas, historial, prórroga del vencimiento, cambio de salida (con opción de recalcular precio) y cancelación (libera los lugares).
  - Las acciones están en `app/admin/booking-actions.ts`.
  - El sidebar muestra el ítem "Reservas" con un badge de alertas, y el layout hace el conteo.
- **Settings nuevos**: `onlineBooking` ("1"/"0"), `bankName`, `bankHolder`, `bankCuit`, `bankCbu` y `bankAlias`, en el grupo "Reservas online y datos para transferencias".
- **Ficha de paquete**: botón "Reservar online" y salidas clickeables cuando `onlineBooking=1` y hay cupo.
- **Analytics**: eventos `begin_checkout` y `purchase`, que se envían también al Meta Pixel.
- **Variables de entorno nuevas** (`.env.example`): `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET`.
- **Seed**: `scripts/seed.ts` borra también las tablas de reservas.

**Verificado:** typecheck OK. Un script sobre una copia de la base confirmó la cotización, el cupo atómico, las transiciones pendiente → confirmada → pagada, el vencimiento con liberación de lugares y la reactivación por pago tardío. Un test de navegador creó una reserva desde el checkout web correctamente.

**Sin verificar:** pago real con Mercado Pago (necesita credenciales de prueba), subida de comprobante desde el navegador y las acciones del detalle admin en vivo.

**Pendientes chicos del módulo 1:**
- Cargar los datos bancarios en Configuración.
- Convertir una consulta en reserva desde `/admin/consultas`.

### Módulo 2: qué se hizo

- **Esquema:** `CURRENCIES = ARS|USD|EUR` y el tipo `Currency` en `packages`, `bookings` y `payments`. `bookings.fxRate` guarda los pesos por unidad al reservar. `payments` tiene `amount` (acreditado en la moneda de la reserva) más `chargedAmount`, `chargedCurrency` y `fxRate` (lo que se cobró realmente). La tabla `exchange_rates` tiene PK `currency` (USD/EUR), `source` (`manual|oficial|blue|bolsa|tarjeta`), `rate` (base) y `markup` (%).
- **`src/lib/fx.ts`** (puro, sirve en el cliente): tipo `Rates` (pesos por unidad, ARS = 1), `convert()` y `CURRENCY_LABELS`. No importar valores de `@/db/schema` en componentes cliente, solo tipos, porque arrastra drizzle al bundle.
- **`src/lib/exchange-rates.ts`**: `getRates()` (cacheado y con el margen aplicado), `getExchangeRows()` (con valores de respaldo USD 1000 / EUR 1100 si la tabla está vacía), `fetchRemoteRate()` (usa DolarAPI con la cotización de venta; para EUR solo hay oficial), `refreshExchangeRates()`, `saveExchangeRate()` y `creditForPayment(amount, charged, bookingCurrency)`.
- **Sitio:** `CurrencyProvider` en `[locale]/layout.tsx` recibe las cotizaciones al momento del ISR. `<Price amount currency>` y `CurrencySwitcher` están en `components/site/currency.tsx`; la preferencia se guarda en localStorage con `useSyncExternalStore` y el servidor renderiza la moneda original. El selector va en el header. La conversión es solo de visualización: la reserva siempre se hace en la moneda del paquete.
- **Pagos:** Mercado Pago ahora acepta cualquier moneda. `createCheckoutPreference` convierte a ARS y envía `metadata.fx_rate` y `amount_booking`; `syncMercadoPagoPayment` acredita `charged / fx_rate`. El comprobante del pasajero y el "Registrar pago" del admin tienen un selector de moneda y convierten con `creditForPayment`. El detalle del admin muestra el monto cobrado y la cotización usada.
- **Admin:** `/admin/monedas` (en el sidebar como "Monedas") con fuente, cotización manual, margen, ejemplo de conversión y botón "Actualizar automáticas". Las acciones están en `app/admin/fx-actions.ts`. El formulario de paquetes acepta EUR.
- **Cron:** `/api/cron/exchange-rates` corre al minuto 15 de cada hora (configurado en `vercel.json`).
- La base real se inicializó con USD y EUR oficiales automáticos. El backup previo está en `data/travelar.db.bak-mod2`.
- **Verificado** con un script: conversión ida y vuelta, `creditForPayment`, DolarAPI en vivo y refresh. Typecheck OK.
- **Limitaciones:** el "desde" de las cards de destino solo considera precios en ARS (como antes). El JSON-LD y la metadata siguen en la moneda original.

### Módulo 3: qué se hizo

- **Rutas:** el sitio público se movió de `app/(site)` a `app/[locale]` (`generateStaticParams` con `LOCALES` y `dynamicParams = false` en el layout). El español va **sin prefijo**: `src/proxy.ts` reescribe `/x` a `/es/x` internamente, redirige `/es/x` a `/x` (308) y deja pasar `/en/*` y `/pt/*`. El matcher excluye `api`, `admin` (que tiene su propio guard), `uploads`, `media`, `_next` y archivos con punto. El proxy también setea el header `x-locale`, que lee `app/not-found.tsx`.
- **`src/lib/i18n/config.ts`:** `LOCALES`, `Locale`, `INTL_LOCALE`, `OG_LOCALE`, `asLocale`, `localePath(locale, path)` (usar SIEMPRE para links internos del sitio), `stripLocale`, `localeAlternates(locale, path)` (canonical + hreflang para `generateMetadata`) e `interpolate(template, vars)` para los `{placeholders}`.
- **`src/lib/i18n/dictionaries.ts`:** diccionarios es/en/pt (`type Dictionary = typeof es`, así que TS obliga a tener las mismas claves). En server: `getDictionary(locale)`. En cliente: `useI18n()` de `components/site/i18n.tsx` devuelve `{ locale, t, href }` (el `I18nProvider` está en el layout). Al agregar textos nuevos, agregarlos en los 3 idiomas.
- **Páginas:** reciben `params.locale` (`PageProps<"/[locale]/...">`), usan `asLocale()` y `getDictionary()` y generan metadata traducida con `localeAlternates`. `Header`, `Footer`, `WhatsAppFloat` y `PackageCard` reciben `locale`; `TrustBar` recibe `t.trust`. En el header hay un `LanguageSwitcher` (cliente; mantiene la ruta y la query).
- **Helpers con idioma:** `formatShortDate/LongDate/MonthYear(iso, locale)`, `formatDuration(d, n, t.common)` y `availabilityLabel(dep, t.common)` (sin el último argumento siguen en español, como usa el admin). `policyLines(policy, t.policy)` y `packageWhatsappMessage(t.wa, {...})`.
- **Contenido de la base:** columna JSON `i18n` en `destinations` (`{en?: {name, summary, description}, pt?: …}`) y `packages` (`title, summary, board, includes, excludes, itinerary`). `lib/i18n/content.ts` (`localizeDestination`, `localizePackage`) cae al español campo por campo. Las queries públicas (`getPackageCards({locale})`, `getUpcomingDepartures(locale, limit)`, `getDestinationCards(locale)`, `getPackageBySlug(slug, locale)`, `getDestinationBySlug(slug, locale)`) ya devuelven el contenido traducido. Los nombres de región, los tags y el hotel no se traducen.
- **Admin:** tarjeta "Traducciones (inglés y portugués)" en la edición de paquetes y destinos (`components/admin/translations.tsx`, campos `i18n.<idioma>.<campo>`, que lee `readPackageI18n` y `readDestinationI18n` en `app/admin/actions.ts`). En Configuración hay un grupo nuevo con `heroTitleEn/Pt`, `heroSubtitleEn/Pt` y `hoursEn/Pt`; se leen con `localizedSetting(settings, key, locale)`.
- **Reservas:** `bookings.locale` guarda el idioma del cliente. `bookingUrl()` lo usa, así que el link de la reserva, el retorno de Mercado Pago y los futuros emails (módulo 9) salen en su idioma. Los formularios públicos (consulta, reserva, comprobante y pago) mandan un hidden `locale` y las acciones devuelven los errores traducidos.
- **SEO:** `sitemap.ts` lista cada URL en los 3 idiomas con `alternates.languages`. El `<html lang>` del root layout queda `es-AR` (no se leen headers para no romper el ISR) y un script inline lo cambia en en/pt.
- **Verificado:** typecheck OK. Un script tsx sobre una copia de la base confirmó `localePath`/`stripLocale`/`bookingUrl`, los mismos placeholders en los 3 diccionarios, los formatos de fecha en/pt y el fallback de traducciones en las queries. Backup previo: `data/travelar.db.bak-mod3`.
- **Limitaciones:** los precios se formatean siempre con `es-AR`. Los mensajes de error de `lib/storage.ts` (tamaño o tipo de comprobante) siguen en español. Los emails y el admin quedan en español.

### Módulo 4: qué se hizo

- **Esquema:** `quotes` (code `CT-XXXXXX`, `accessToken`, status `borrador|enviada|aceptada|rechazada|convertida`, cliente, `leadId`/`packageId`/`departureId`/`bookingId` opcionales, `passengers`, `travelDate`, `currency`, `validUntil`, `notes` (las ve el cliente), `internalNotes`, `locale`, `sentAt`/`viewedAt`/`respondedAt`) y `quote_items` (`kind` `paquete|aereo|hotel|traslado|excursion|seguro|otro`, descripción, detalle, `supplier` (vacío = propio), fechas, `quantity`, `unitCost`, `unitPrice`, `position`). "Vencida" no se guarda: `quoteDisplayStatus()` la calcula cuando una cotización abierta pasó `validUntil`.
- **`src/lib/quote-calc.ts`** (puro): `priceFromMarkup`, `markupOf`, `quoteTotals(items, pax)` (total, costo, margen, % de margen sobre el precio, por persona) y `quoteDisplayStatus`.
- **`src/lib/quotes.ts`:** `generateQuoteCode`, `quoteUrl` (en el idioma de la cotización), `quotePdfUrl`, `getQuoteWithItems`, `getQuoteForCustomer` (token en tiempo constante), `getDepartureOptions` y `getQuoteTotalsMap`.
- **PDF:** `src/lib/pdf/quote-pdf.tsx` con `@react-pdf/renderer` (`serverExternalPackages` en `next.config.ts`, Helvetica, así que el texto pasa por `clean()` para quedar en Latin-1; el logo webp se convierte a PNG con sharp). Se sirve en `/api/cotizaciones/[code]/pdf?t=TOKEN` (inline, `no-store`). Textos desde el diccionario `quote` en el idioma de la cotización.
- **Admin:** `/admin/cotizaciones` (alta desde cero, desde una salida del catálogo, que agrega el ítem paquete y fija la moneda, o desde una consulta con `?lead=ID`, que pasa la consulta a "cotizado"; filtros por estado y búsqueda; tabla con total y margen). `/admin/cotizaciones/[id]` permite editar ítems (costo, markup y precio en vivo con `components/admin/quote-item-fields.tsx`; reordenar; borrar), ver totales y margen, compartir el link por WhatsApp o email (`CopyField`), cambiar estados, prorrogar 7 días, duplicar, eliminar y **convertir en reserva**. Las acciones están en `app/admin/quote-actions.ts`. El sidebar tiene "Cotizaciones" y cada consulta tiene un botón "Cotizar".
- **Convertir en reserva:** exige una salida del catálogo con la misma moneda. Reserva los lugares, crea la reserva (`source: "cotizacion"`) con el total de la cotización, la seña según la política y los pasajeros de las líneas "Nombre | DNI", y deja la cotización en `convertida` con su `bookingId`. Las cotizaciones a medida, sin salida, solo se marcan como aceptadas.
- **Sitio:** `/cotizacion/[code]?t=TOKEN` (`noindex`; marca `viewedAt` la primera vez salvo con `&preview=1`, que usa el admin). Muestra los servicios solo con precio de venta, total, por persona, notas, avisos de vencida, aceptada, rechazada o reservada (con link a la reserva), botones aceptar y rechazar (`respondQuote` en `app/[locale]/cotizacion/actions.ts`), PDF y WhatsApp.
- **Verificado:** typecheck OK. Un script sobre una copia de la base confirmó cálculos, estados, token, totales y el PDF (texto extraído con `pdftotext`, en inglés para una cotización `en`). Backup previo: `data/travelar.db.bak-mod4`.
- **Sin verificar:** las acciones del admin y la conversión en reserva en vivo.
- **Limitaciones:** el envío por email es un `mailto:` hasta el módulo 9. Los ítems no se traducen (se cargan en el idioma del cliente). Los servicios de terceros todavía no generan deuda con proveedores (módulo 8).

### Módulo 6: qué se hizo

- **Modelo:** los productos son filas de `packages` con `kind` (`paquete|actividad|traslado|hotel`). Los paquetes siguen con salidas cargadas a mano. Los otros tres son **diarios**: se reservan cualquier día habilitado (`weekdays`, 0 = domingo) dentro de `BOOKING_WINDOW_DAYS` (180), desde mañana, con `dailyCapacity` por día (actividad: personas; traslado: vehículos; hotel: habitaciones por noche). Otros campos: `capacityPerUnit` (pasajeros por vehículo o huéspedes por habitación), `minNights` (hotel) y `schedule` (horario, punto de encuentro o check-in, traducible en `i18n`).
- **Fechas = filas de `departures`:** cada día o noche de un producto diario es una fila (índice único `packageId + date`) que se crea al reservar (`ensureDailyDepartures`) o cuando el admin fija tarifas. Sin fila, el día vale el precio base y el cupo diario. `priceOverride` es la tarifa de esa fecha y `cancelled` la cierra.
- **Reservas:** `bookings.units` (vehículos o habitaciones; null = pasajeros) y `bookings.nights` (hotel; 0 = una fecha). `departureId` es la primera fecha (check-in). `seatsPerDate()` da el cupo por fecha y `reserveBookingSeats`/`releaseBookingSeats` (en `lib/bookings.ts`) ocupan o liberan todas las noches, o ninguna si alguna no tiene lugar. Las usan el vencimiento, la reactivación por pago tardío y la cancelación.
- **Precios (`lib/pricing.ts`, `quoteBooking`):** paquete y actividad, por persona (recargo single solo en paquetes); traslado, por vehículo (`vehiclesFor(pax, porVehículo)`); hotel, suma de las tarifas de cada noche por habitaciones (`unitPrice` = promedio por noche).
- **`lib/products.ts`:** `DAILY_KINDS`, `KIND_PATH`, `isDailyKind`, `getDailyAvailability(pkg)` (`{fecha: [precio, libres]}` solo con días abiertos), `ensureDailyDepartures`, `getPublishedKinds` y `getProductCards(kind, locale, destinationId?)`. `lib/format.ts` suma `nightDates` y `daysBetweenISO`.
- **Sitio:** listados `/excursiones`, `/traslados` y `/hoteles` (`components/site/product-listing.tsx`, `product-card.tsx`), que aparecen en el header solo si hay productos publicados de ese tipo. Ficha `/productos/[slug]` (`/paquetes/[slug]` redirige ahí si no es paquete, y al revés). La página de destino muestra también sus productos. Están en el sitemap. Textos en `t.products` (es/en/pt).
- **Checkout:** el mismo `BookingForm` con la prop `daily` (calendario, mínimo de noches, capacidad). Actividad y traslado: fecha y personas (el traslado calcula los vehículos). Hotel: entrada, salida y habitaciones (huéspedes ≤ habitaciones × capacidad). `createBooking` valida fecha, ventana, días de la semana y estadía, y crea las fechas en la misma transacción.
- **Admin:** "Paquetes" pasó a "Productos" (filtro por tipo y botones para crear cada uno con `?tipo=`). En la edición, los diarios muestran "Tarifa y disponibilidad" y la tarjeta "Tarifas y cupos por fecha" (`setDailyRates`: un rango para fijar precio y cupo, cerrar fechas o volver a la base, más la tabla de fechas con ocupación). Al cambiar el cupo diario se actualizan las fechas futuras que tenían el cupo anterior. No se puede cambiar el tipo de un producto con reservas. El detalle de reserva muestra estadía, habitaciones o vehículos. El dashboard, `/admin/salidas`, la carga manual de reservas y las cotizaciones solo listan salidas de paquetes.
- **Verificado:** typecheck OK. Scripts sobre una copia de la base: el catálogo de paquetes no se contamina, calendario con días cerrados y temporada alta, cotización de hotel y traslado, cupo atómico en varias noches sin ocupación parcial, vencimiento y reactivación por pago tardío, y `createBooking` de punta a punta para un hotel (mínimo de noches, total, `units`/`nights`, sin cupo). Backup previo: `data/travelar.db.bak-mod6`.
- **Limitaciones:** no se puede cambiar la fecha de una reserva de hotel de varias noches (hay que cancelar y cargar otra). La carga manual de reservas y la conversión de cotizaciones solo funcionan con paquetes. `/destinos` solo lista destinos que tienen paquetes. Los hoteles no tienen tipos de habitación (una tarifa por habitación).

### Módulo 7: qué se hizo

- **Alta de reservas compartida:** `src/lib/booking-create.ts` (`placeBooking(input)`) tiene toda la lógica de alta (validación de salida, fecha o estadía, cupo atómico, pasajeros, historial y lead) y devuelve `{ok, booking, title}` o `{ok: false, reason: invalid|unavailable|no_seats, message, fieldErrors}`. La usan el checkout web (`createBooking` solo parsea el formulario, revalida y redirige) y la API.
- **Esquema:** `api_keys` (name, `prefix` visible, `keyHash` SHA-256 único, `scopes` `catalog:read|bookings:read|bookings:write`, `lastUsedAt`, `requestCount`, `revokedAt`, `createdBy`) y `bookings.apiKeyId`. Las reservas de la API tienen `source: "api"` y el lead `reserva-api`.
- **`src/lib/api.ts`:** `generateApiKey()` (`ta_` + 24 bytes base64url; la clave completa se muestra una sola vez), `hashApiKey`, `authenticate(req, scope)` (`Authorization: Bearer` o `X-API-Key`; límite de 120 pedidos por minuto en memoria por instancia), `ApiError`, `apiJson` (`no-store`) y `apiRoute(scope, handler)`, que envuelve los endpoints y devuelve `{error: {code, message, details}}`.
- **`src/lib/api-data.ts`:** serializadores (`serializeProduct`, `serializeDeparture`, `serializeDestination`, `serializeBooking`), `getProductForApi(slugOId)` y `bookingWith`. Los campos van en inglés: `type` `package|activity|transfer|hotel`, `priceUnit` `person|vehicle|room_night`.
- **Endpoints (`src/app/api/v1`):**
  - `GET /api/v1` es el índice, sin autenticación.
  - `GET /products` (filtros `type`, `destination` y `locale`) y `GET /products/{slug}` (ficha completa, condiciones y salidas de los paquetes).
  - `GET /products/{slug}/availability`: salidas en paquetes o calendario diario `from`/`to`, por defecto 60 días.
  - `GET /destinations` y `GET /rates`.
  - `POST /bookings`: JSON con `product`, `departureId` o `date`/`checkOut`/`rooms`, `contact`, `travelers[]` con `infant`, `paymentMethod` `bank_transfer|mercadopago` (devuelve `checkoutUrl`), `payAmount` y `locale`. Respeta `onlineBooking` (503).
  - `GET /bookings` (`status`, `limit`) y `GET /bookings/{code}`, que solo muestran las reservas creadas con la misma clave.
  - Códigos de error: 401, 403, 404, 409 (sin cupo o fecha cerrada), 422, 429 y 503.
- **Admin:** `/admin/api` ("API" en el sidebar) para crear claves con permisos (solo el rol admin; `components/admin/api-key-form.tsx` muestra la clave una vez con `CopyField`), ver último uso y cantidad de pedidos, revocar, y leer la documentación con ejemplos. Las acciones están en `app/admin/api-actions.ts`.
- **Verificado:** typecheck OK. Un script llamó a los handlers sobre una copia de la base y confirmó autenticación (sin clave, clave falsa, revocada), permisos, filtros, ficha, calendario diario, validación 422, alta (`source`, total, `locale`, `apiKeyId`), 409 sin cupo, aislamiento de reservas entre claves y el contador de uso. Fuera de Next, `revalidatePath` falla después de guardar; dentro de Next funciona. Backup previo: `data/travelar.db.bak-mod7`.
- **Limitaciones:** no hay `Idempotency-Key` (un reintento puede duplicar una reserva), ni cancelación o modificación por API, ni webhooks salientes (quedan para el módulo 9). El límite de pedidos es por instancia serverless.

### Módulo 8: qué se hizo

- **Esquema:**
  - `payments` suma `paidAt` (se setea al aprobar o registrar, y en el sync de Mercado Pago con `date_approved`) y `refundedAt`. Los pagos previos se completaron con `updated_at`.
  - Tablas nuevas:
    - `suppliers`: name, kind `SUPPLIER_KINDS`, CUIT, contacto, datos bancarios, notas y active.
    - `supplier_costs`: la deuda con un proveedor, opcionalmente asociada a una reserva. Lleva monto, moneda, vencimiento y `voided`.
    - `supplier_payments`: imputado a un costo (`costId`) o a cuenta, con `account`.
    - `cash_movements`: movimientos manuales con ingreso o egreso, `CASH_CATEGORIES` y `CASH_ACCOUNTS` = caja|banco|mercadopago.
- **`src/lib/accounting.ts`:** la caja es un libro **derivado**, sin filas duplicadas. `getLedger(from, to)` une:
  - los cobros (por `paidAt`, con la cuenta según el medio de pago en `METHOD_ACCOUNT` y el monto realmente cobrado, `chargedAmount`);
  - los reintegros (por `refundedAt`);
  - los pagos a proveedores;
  - los movimientos manuales.

  Otras funciones:
  - `getAccountBalances`: saldo histórico por cuenta y moneda.
  - `getReceivables`: reservas activas con saldo pendiente.
  - `getCosts({supplierId, bookingId, unpaidOnly})`: costos con lo pagado y lo pendiente.
  - `getSupplierBalances`: costos vigentes menos pagos, incluidos los pagos a cuenta.
  - `getProfitability(from, to)`: reservas que viajan en el período, con los costos convertidos a la moneda de la reserva usando la cotización actual.
  - `getBookingCostSummary` y `monthRange`.
- **Acciones** (`app/admin/accounting-actions.ts`):
  - Proveedores: `saveSupplier` y `deleteSupplier`. El borrado solo lo puede hacer el rol admin; si el proveedor tiene movimientos, lo desactiva en vez de borrarlo.
  - Costos: `addSupplierCost` acepta `bookingId` o `bookingCode` y deja un evento en la reserva. También están `toggleVoidCost` y `deleteSupplierCost` (solo admin).
  - Pagos a proveedores: `addSupplierPayment` exige que el pago esté en la moneda del costo; `deleteSupplierPayment` es solo para admin.
  - Caja: `addCashMovement` y `deleteCashMovement` (solo admin).
- **Admin:**
  - `/admin/contabilidad?mes=YYYY-MM` muestra:
    - ingresos, egresos, resultado y margen del mes, con navegación entre meses;
    - saldos por cuenta;
    - totales a cobrar y a pagar;
    - el libro de caja con alta de movimientos manuales;
    - la rentabilidad de cada viaje;
    - los saldos a cobrar y los costos impagos.

    Hay un export CSV en `/admin/contabilidad/export?mes=`.
  - `/admin/proveedores` lista los proveedores con su saldo y permite darlos de alta. `/admin/proveedores/[id]` tiene los costos (cargar, anular, borrar), los pagos (imputados o a cuenta) y los datos editables.
  - El detalle de la reserva tiene la card "Costos de proveedores", con el margen y la carga rápida de costos.
  - El sidebar suma "Contabilidad" y "Proveedores". Los montos por moneda se muestran con `components/admin/money.tsx` (`MoneyByCurrency`, `addTo`).
- **Cotización → reserva:** cada ítem que tiene `supplier` y costo genera un `supplier_cost` de `unitCost × quantity`. Si no existe un proveedor con ese nombre (sin distinguir mayúsculas), se crea uno con el rubro deducido del tipo de ítem.
- **Verificado:** typecheck OK. Un script sobre una copia de la base confirmó libro, cuentas, totales, saldos de proveedor con anulados, pendiente por costo, a cobrar, rentabilidad y `monthRange`. Backup previo: `data/travelar.db.bak-mod8`.
- **Sin verificar:** las pantallas en vivo y la generación de costos al convertir una cotización.
- **Limitaciones:**
  - No hay facturación electrónica (AFIP) ni plan de cuentas o asientos: es una contabilidad de gestión.
  - La rentabilidad convierte los costos con la cotización del día, no con la histórica.
  - Las transferencias entre cuentas se cargan como dos movimientos manuales.

### Módulo 9: qué se hizo

- **Decisión del usuario:** Resend para los emails; sin bot de Telegram ni WhatsApp (los avisos internos van por email).
- **Esquema:** tabla `email_log` (kind `EMAIL_KINDS`, to, subject, html, text, status `pendiente|enviado|error|omitido`, error, providerId, `dedupeKey` único, bookingId/quoteId, attempts). Guarda el HTML para poder reintentar.
- **`src/lib/email/`:**
  - `send.ts`: `deliver(email)` registra y manda con `fetch` a la API de Resend (timeout 10 s). Nunca tira. Con `dedupeKey` no repite un email ya enviado (sí reintenta si el anterior falló). Sin `RESEND_API_KEY` queda como `omitido`. También `retryEmail(id)`, `emailConfigured()` y `emailFrom()`.
  - `template.ts`: `renderEmail()` arma el HTML con tablas y estilos inline más la versión texto.
  - `i18n.ts`: textos al pasajero en es/en/pt (`emailDictionary(locale)`). Los avisos internos van solo en español.
- **`src/lib/notifications.ts`:** `notifyBookingCreated`, `notifyPaymentApproved` (al pasajero y, si es de Mercado Pago, aviso interno), `notifyReceiptUploaded` (interno), `notifyBookingClosed(id, "reserva_vencida"|"reserva_cancelada")`, `sendBookingReminders()` (seña: pendientes que vencen en ≤ 12 h y se crearon hace más de 3 h; saldo: confirmadas con `balanceDueDate` en ≤ 3 días; una vez por reserva y fecha), `sendQuoteEmail` y `sendTestEmail`. Los links son absolutos con `NEXT_PUBLIC_SITE_URL` y en el idioma de la reserva. `reply_to` = email de contacto.
- **Dónde se disparan:**
  - `placeBooking` (web y API), la carga manual (checkbox "mandarle el link") y la conversión de cotización: reserva recibida, con datos bancarios si paga por transferencia.
  - `syncMercadoPagoPayment`, `reviewPayment` al aprobar y `registerPayment` (checkbox "Avisar al pasajero"): pago acreditado.
  - `uploadReceipt`: aviso interno.
  - `cancelBooking` (checkbox): reserva cancelada. `expireBookings`: reserva vencida (import dinámico de notifications para evitar el ciclo).
  - `/api/cron/bookings`: además de vencer, manda los recordatorios.
  - Cotizaciones: botón "Enviar por email" (`emailQuote` en `quote-actions.ts`), que pasa la cotización de borrador a enviada.
- **Settings:** `emailCustomers` y `emailAdminAlerts` ("1"/"0") y `notifyEmail` (si está vacío se usa `email`), en el grupo "Emails" de Configuración.
- **Admin:** `/admin/emails` ("Emails" en el sidebar) muestra el estado de la configuración, prueba de envío (solo admin), filtros por estado, registro con link a la reserva o cotización y "Reintentar". El detalle de la reserva tiene la card "Emails".
- **Variables de entorno:** `RESEND_API_KEY` y `EMAIL_FROM` (en `.env.example`). Sin dominio verificado, Resend solo entrega a la casilla de la cuenta.
- **Verificado:** typecheck OK. Un script sobre una copia de la base con `fetch` simulado confirmó: omitido sin clave, reserva recibida con datos bancarios y link absoluto, sin duplicados, aviso interno, pago con Mercado Pago, comprobante, recordatorios de seña (en inglés) y saldo sin repetir, email al vencer, error de Resend y reintento, y cotización en portugués con link al PDF. Backup previo: `data/travelar.db.bak-mod9`.
- **Sin verificar:** el envío real con Resend (faltan la clave y el dominio) y las pantallas en vivo.
- **Limitaciones:** los envíos son sincrónicos dentro de la acción (suman hasta ~1 s). No hay webhooks de Resend (rebotes y aperturas). El cron de Vercel Hobby corre una vez por día, así que el recordatorio de seña de 12 h puede no llegar a tiempo.

### Módulo 10: qué se hizo

- **Decisión:** la búsqueda y la reserva contra proveedores externos viven en el admin. No ocupan cupo del catálogo propio ni generan una reserva `TA-`. Un conector real se agrega implementando `TravelProvider` y sumándolo a `PROVIDERS` en `src/lib/connectors/index.ts`.
- **Esquema:**
  - `provider_configs` (PK `code`, enabled, markup %, credentials JSON). Sin fila, el simulado queda activo con 15% de margen.
  - `connector_orders` (code `CN-XXXXXX`, provider, kind `hotel|aereo|actividad|traslado`, status `confirmada|cancelada|error`, externalRef, offerId, neto y precio, contacto, viajeros, `supplierCostId`).
- **`src/lib/connectors/`:**
  - `types.ts`: `TravelProvider` con `search`, `quote`, `book` y `cancel`. `quote` no reserva.
  - `mock.ts`: inventario fijo de hoteles, aéreos, excursiones y traslados en Bariloche, Mendoza, Iguazú, Salta, Buenos Aires y Ushuaia. El neto sube 30% en enero, febrero y julio. El localizador es `MOCK-` + el código interno. `book` rechaza al titular "falla" y `cancel` rechaza un localizador que termina en `-FALLA`.
  - `index.ts`: `listProviders`, `saveProviderConfig`, `parseSearch`, `searchOffers` (un proveedor que falla no corta al resto), `bookOffer` (confirma, crea el proveedor "Simulado" si no existe y carga el costo neto), `addOfferToQuote` (suma el servicio a una cotización de la misma moneda, sin reservar) y `cancelOrder` (anula el costo; si ya tiene pagos, no cancela).
- **Admin:** `/admin/conectores` ("Conectores" en el sidebar) busca por tipo, destino y fechas, reserva o agrega la tarifa a una cotización abierta, y lista las órdenes. `/admin/conectores/[id]` muestra el margen y cancela. El margen y el alta/baja del conector los cambia solo el rol admin.
- **Verificado:** typecheck OK. Un script sobre una copia de la base confirmó la búsqueda (con temporada alta y margen), el proveedor desactivado, la reserva con costo, el rechazo del proveedor, el alta en una cotización en USD, el rechazo por moneda distinta, la cancelación con el costo anulado y el bloqueo cuando el costo ya tiene pagos. Backup previo: `data/travelar.db.bak-mod10`. Los conteos de las tablas anteriores no cambiaron.
- **Sin verificar:** las pantallas en vivo.
- **Limitaciones:**
  - No hay búsqueda pública ni ficha en el sitio: el pasajero no reserva un hotel de Hotelbeds desde la web.
  - Amadeus, Hotelbeds y el resto no están implementados. Hace falta el contrato y las credenciales.
  - La orden del conector no tiene página para el pasajero ni manda email.
  - Si se confirma en el proveedor y falla el guardado local, se intenta cancelar en el proveedor.

### Infraestructura para Vercel

- **Base:** se pasó de libSQL/Turso a Postgres con Drizzle (`pgTable`, `timestamp` con zona, `boolean`, `jsonb`, `serial`). El cliente está en `src/db/index.ts` (`Pool` de `pg`, que también se exporta como `pool`). Los datos se copiaron de SQLite con `scripts/migrate-sqlite-to-pg.ts` y los conteos coinciden.
- **Archivos:** Cloudinary (ver "Entorno local").
- **Crons:** diarios en `vercel.json` (plan Hobby).
- **Verificado:** typecheck, `next build` y un script contra Postgres con catálogo, cupo atómico, reserva de punta a punta, pago y recálculo, vencimiento, contabilidad, cotizaciones, `ilike` y las consultas del dashboard.
- **Sin verificar:** la subida real a Cloudinary (faltan credenciales) y Neon (se probó con Postgres 16 local).

## Módulos del plan

Los diez módulos del plan quedaron cerrados (el 5, portal B2B, se descartó). Lo que sigue depende de credenciales del cliente: Mercado Pago real, Resend con dominio verificado, y un conector real.
