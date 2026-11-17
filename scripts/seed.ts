import { existsSync, readFileSync } from "node:fs";
import { join, parse } from "node:path";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";

try {
  process.loadEnvFile(".env.local");
} catch {}

const { db, schema, pool } = await import("../src/db");
const { slugify, toISODate } = await import("../src/lib/format");
type Region = import("../src/db/schema").Region;
type ItineraryDay = import("../src/db/schema").ItineraryDay;

type WooProduct = {
  id: number;
  name: string;
  short_description: string;
  description: string;
  prices: { price: string; currency_minor_unit: number };
  categories: { name: string }[];
  images: { src: string }[];
  attributes: { name: string; terms: { name: string }[] }[];
};

const DESTINATIONS: Record<string, [Region, string, string]> = {
  Tilcara: ["Norte", "Jujuy", "Quebrada de Humahuaca, cerros de colores y pueblos con historia."],
  Salta: ["Norte", "Salta", "La linda: peñas, Cafayate, Cachi y paisajes de la Puna."],
  Tucumán: ["Norte", "Tucumán", "El jardín de la República, Tafí del Valle y la ruta de la independencia."],
  "Termas de Río Hondo": ["Norte", "Santiago del Estero", "Aguas termales para descansar y recargar energía."],
  "La Rioja": ["Norte", "La Rioja", "Talampaya, Chilecito y la cordillera riojana."],
  Aimogasta: ["Norte", "La Rioja", "La capital del olivo, puerta a los paisajes riojanos."],
  Ushuaia: ["Patagonia", "Tierra del Fuego", "El fin del mundo: Canal Beagle, Parque Nacional y el tren austral."],
  Bariloche: ["Patagonia", "Río Negro", "Lagos, bosques, chocolate y el Circuito Chico."],
  "Puerto Madryn": ["Patagonia", "Chubut", "Ballenas, pingüinos y Península Valdés."],
  Calafate: ["Patagonia", "Santa Cruz", "Glaciar Perito Moreno y la Patagonia austral."],
  "San Rafael": ["Cuyo", "Mendoza", "Cañón del Atuel, bodegas y aventura."],
  Mendoza: ["Cuyo", "Mendoza", "Vinos, montaña y el Aconcagua."],
  "Villa de Merlo": ["Cuyo", "San Luis", "Microclima único al pie de los Comechingones."],
  Cortaderas: ["Cuyo", "San Luis", "Sierras, arroyos y tranquilidad en la Costa de los Comechingones."],
  "Villa Carlos Paz": ["Centro", "Córdoba", "Lago San Roque, sierras y temporada de teatro."],
  "La Pampa": ["Centro", "La Pampa", "Llanura, lagunas y cultura gaucha."],
  "Cataratas del Iguazú": ["Litoral", "Misiones", "Una de las 7 maravillas naturales del mundo."],
  Gualeguaychú: ["Litoral", "Entre Ríos", "Río, playas, termas y el carnaval del país."],
  "Termas de Guaychú": ["Litoral", "Entre Ríos", "Full day de piscinas termales a pocas horas de Buenos Aires."],
  Colón: ["Litoral", "Entre Ríos", "Playas sobre el río Uruguay, termas y el Parque El Palmar."],
  Paraná: ["Litoral", "Entre Ríos", "Costanera, barrancas y la ciudad sobre el río."],
  Ñandubaysal: ["Litoral", "Entre Ríos", "Playa de arena blanca sobre el río Uruguay."],
  Tandil: ["Buenos Aires", "Buenos Aires", "Sierras, picadas y la Piedra Movediza."],
  "San Pedro": ["Buenos Aires", "Buenos Aires", "Quintas, Vuelta de Obligado y ensaimadas."],
  "Termas de Tapalqué": ["Buenos Aires", "Buenos Aires", "Piscinas termales en el corazón de la provincia."],
  "Campo La Herradura": ["Buenos Aires", "Buenos Aires", "Día de campo con comida criolla y actividades."],
  "Mar del Plata": ["Costa Atlántica", "Buenos Aires", "La Feliz: playa, puerto y paseos."],
  "San Bernardo": ["Costa Atlántica", "Buenos Aires", "Playas familiares de la Costa Atlántica."],
  "San Clemente": ["Costa Atlántica", "Buenos Aires", "Mundo Marino, Termas Marinas y playa."],
  Camboriú: ["Internacional", "Santa Catarina, Brasil", "Playas brasileñas, Unipraias y vida nocturna."],
};

const FEATURED_DESTINATIONS = new Set(["Bariloche", "Cataratas del Iguazú", "Puerto Madryn", "Salta", "Ushuaia", "Villa de Merlo"]);

function decode(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;|&#8212;/g, "–")
    .replace(/&#8220;|&#8221;|&quot;/g, '"')
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/\s+/g, " ")
    .trim();
}

function localImage(src: string | undefined) {
  if (!src) return null;
  const file = `${parse(src).name}.webp`;
  return existsSync(join(process.cwd(), "public", "media", file)) ? `/media/${file}` : src;
}

function parseProduct(p: WooProduct) {
  const lines = p.short_description.split(/<\/p>/i).map(decode).filter(Boolean);
  let days = 1;
  let nights = 0;
  let transport: "bus" | "aereo" = "bus";
  let transportDetail = "";
  let hotel = "";
  let board = "";
  const extras: string[] = [];

  for (const line of lines) {
    const program = line.match(/^Programa de (\d+) D[ií]as? \| (\d+) Noches?/i);
    if (program) {
      days = Number(program[1]);
      nights = Number(program[2]);
      continue;
    }
    if (/^Programa Full Day/i.test(line)) continue;
    if (/^A[ée]reos?/i.test(line)) {
      transport = "aereo";
      transportDetail = line;
      continue;
    }
    if (/^Traslados en Bus/i.test(line)) {
      transportDetail = line;
      continue;
    }
    const lodging = line.match(/Noches? de alojamiento \| (.+)$/i);
    if (lodging) {
      hotel = lodging[1].trim();
      continue;
    }
    const pension = line.match(/^Pensi[oó]n \| (.+)$/i);
    if (pension) {
      board = pension[1].trim();
      continue;
    }
    const extra = line.replace(/^Incluye \| /i, "").replace(/^Incluye /i, "");
    extras.push(extra.charAt(0).toUpperCase() + extra.slice(1));
  }

  const minor = 10 ** (p.prices.currency_minor_unit ?? 2);
  const rawPrice = Math.round(Number(p.prices.price) / minor);
  const currency: "ARS" | "USD" = rawPrice < 10000 ? "USD" : "ARS";

  const dates = (p.attributes.find((a) => a.name === "Fecha de salida")?.terms ?? [])
    .map((t) => t.name.match(/(\d{2})\/(\d{2})\/(\d{4})/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ day: Number(m[1]), month: Number(m[2]) }));

  const categories = p.categories.map((c) => c.name);
  const tags = new Set<string>();
  for (const c of categories) {
    if (c === "Super Sale") tags.add("Super Sale");
    if (c === "Vacaciones Invierno") tags.add("Vacaciones de invierno");
    if (/^Feriado/.test(c)) tags.add("Fin de semana largo");
  }

  return {
    days,
    nights,
    transport,
    transportDetail,
    hotel,
    board,
    extras,
    price: rawPrice,
    currency,
    dates,
    tags: [...tags],
    featured: categories.includes("Recomendados"),
    image: localImage(p.images[0]?.src),
    video: p.description.match(/https?:\/\/[^"'\s<>]+\.mp4/)?.[0] ?? null,
  };
}

const today = new Date();
today.setHours(0, 0, 0, 0);
const minDate = new Date(today.getTime() + 7 * 86400000);

function nextOccurrence(day: number, month: number) {
  let year = today.getFullYear();
  let date = new Date(year, month - 1, day);
  while (date < minDate) date = new Date(++year, month - 1, day);
  return toISODate(date);
}

function generatedDates(seed: number, fullDay: boolean) {
  const out: string[] = [];
  const start = new Date(minDate);
  start.setDate(start.getDate() + ((6 - start.getDay() + 7) % 7) + (seed % 3) * 7);
  for (let i = 0; i < 3; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i * (fullDay ? 14 : 21));
    out.push(toISODate(d));
  }
  return out;
}

function buildItinerary(name: string, transport: "bus" | "aereo", days: number, nights: number): ItineraryDay[] {
  if (days <= 1) {
    return [{ title: "Full day", text: `Salida temprano desde Buenos Aires, día completo en ${name} y regreso por la noche.` }];
  }
  const travelNights = transport === "bus" ? Math.max(0, days - nights - 1) : 0;
  const out: ItineraryDay[] = [];
  for (let i = 1; i <= days; i++) {
    if (i === 1) {
      out.push({
        title: "Salida",
        text:
          transport === "aereo"
            ? `Vuelo desde Buenos Aires a ${name}. Traslado al hotel y check-in.`
            : travelNights > 0
              ? "Salida en bus desde Buenos Aires. Viaje nocturno con coordinación a bordo."
              : `Salida en bus desde Buenos Aires hacia ${name}. Llegada y check-in.`,
      });
    } else if (i === days) {
      out.push({
        title: "Regreso",
        text: transport === "aereo" ? "Check-out, traslado al aeropuerto y vuelo de regreso." : "Llegada a Buenos Aires.",
      });
    } else if (transport === "bus" && travelNights > 1 && i === days - 1) {
      out.push({ title: "Último día y regreso", text: "Mañana libre, check-out y salida en bus hacia Buenos Aires." });
    } else if (transport === "bus" && travelNights > 0 && i === 2) {
      out.push({ title: `Llegada a ${name}`, text: "Llegada, check-in y primera recorrida con el coordinador." });
    } else {
      out.push({ title: `Día en ${name}`, text: "Día para disfrutar del destino. Excursiones opcionales con el coordinador." });
    }
  }
  return out;
}

async function main() {
  const raw = readFileSync(join(process.cwd(), "scripts/data/woocommerce-products.json"), "utf8").replace(/^\uFEFF/, "");
  const products = (JSON.parse(raw) as WooProduct[]).sort((a, b) => b.id - a.id);

  console.log("Limpiando tablas...");
  await db.delete(schema.connectorOrders);
  await db.delete(schema.providerConfigs);
  await db.delete(schema.emailLog);
  await db.delete(schema.supplierPayments);
  await db.delete(schema.supplierCosts);
  await db.delete(schema.suppliers);
  await db.delete(schema.cashMovements);
  await db.delete(schema.quoteItems);
  await db.delete(schema.quotes);
  await db.delete(schema.bookingEvents);
  await db.delete(schema.payments);
  await db.delete(schema.bookingPassengers);
  await db.delete(schema.bookings);
  await db.delete(schema.leads);
  await db.delete(schema.departures);
  await db.delete(schema.packages);
  await db.delete(schema.destinations);
  await db.delete(schema.policies);
  await db.delete(schema.reviews);
  await db.delete(schema.settings);

  const [busPolicy, airPolicy, intlPolicy] = await db
    .insert(schema.policies)
    .values([
      {
        name: "Terrestres nacionales",
        depositPercent: 20,
        depositHours: 48,
        finalPaymentDays: 10,
        adminFee: "$5.000 por pasajero",
        infantsMonths: 36,
        singleSurcharge: 50,
        shareMode: true,
        extraNotes: ["Valor publicado referido a habitaciones en base doble, triple o cuádruple."],
      },
      {
        name: "Aéreos nacionales",
        depositPercent: 30,
        depositHours: 48,
        finalPaymentDays: 10,
        adminFee: "U$S 20 por pasajero",
        infantsMonths: 36,
        singleSurcharge: 50,
        shareMode: true,
        extraNotes: ["Valor publicado referido a habitaciones en base doble, triple o cuádruple."],
      },
      {
        name: "Internacionales y temporada",
        depositPercent: 30,
        depositHours: 72,
        finalPaymentDays: 15,
        adminFee: "$5.000 por pasajero",
        infantsMonths: 24,
        singleSurcharge: 50,
        shareMode: true,
        extraNotes: ["Valor publicado referido a habitaciones en base doble, triple o cuádruple."],
      },
    ])
    .returning();

  const destinationIds = new Map<string, number>();
  const pkgByKey = new Map<string, { id: number; price: number; dates: Set<string>; seatsTotal: number }>();
  const usedSlugs = new Set<string>();
  let departuresCount = 0;

  for (const product of products) {
    const name = product.name.trim();
    const parsed = parseProduct(product);

    if (!destinationIds.has(name)) {
      const [region, province, summary] = DESTINATIONS[name] ?? (["Centro", "", ""] as [Region, string, string]);
      const [dest] = await db
        .insert(schema.destinations)
        .values({
          slug: slugify(name),
          name,
          region,
          province,
          summary,
          description: summary,
          image: parsed.image,
          featured: FEATURED_DESTINATIONS.has(name),
        })
        .returning({ id: schema.destinations.id });
      destinationIds.set(name, dest.id);
    }

    const key = [slugify(name), parsed.transport, parsed.days, parsed.nights, slugify(parsed.hotel)].join("|");
    let pkg = pkgByKey.get(key);

    if (!pkg) {
      const base =
        parsed.days <= 1
          ? `${slugify(name)}-full-day`
          : `${slugify(name)}-${parsed.transport === "aereo" ? "aereo" : "bus"}-${parsed.days}-dias`;
      let slug = base;
      for (let i = 2; usedSlugs.has(slug); i++) slug = `${base}-${i}`;
      usedSlugs.add(slug);

      const includes = [
        parsed.transportDetail,
        parsed.nights > 0 && parsed.hotel ? `${parsed.nights} noches de alojamiento en ${parsed.hotel}` : "",
        parsed.board ? `Pensión: ${parsed.board}` : "",
        ...parsed.extras,
      ].filter(Boolean);

      const isIntl = DESTINATIONS[name]?.[0] === "Internacional";
      const [row] = await db
        .insert(schema.packages)
        .values({
          slug,
          title: name,
          destinationId: destinationIds.get(name)!,
          policyId: isIntl ? intlPolicy.id : parsed.transport === "aereo" ? airPolicy.id : busPolicy.id,
          transport: parsed.transport,
          transportDetail: parsed.transportDetail,
          days: parsed.days,
          nights: parsed.nights,
          hotel: parsed.hotel,
          board: parsed.board,
          price: parsed.price,
          currency: parsed.currency,
          summary: DESTINATIONS[name]?.[2] ?? "",
          includes,
          excludes: [
            "Excursiones opcionales no mencionadas",
            "Comidas y bebidas no especificadas",
            "Gastos administrativos (ver condiciones)",
          ],
          itinerary: buildItinerary(name, parsed.transport, parsed.days, parsed.nights),
          image: parsed.image,
          video: parsed.video,
          tags: parsed.tags,
          featured: parsed.featured,
          published: true,
          legacyIds: [product.id],
        })
        .returning({ id: schema.packages.id });

      pkg = { id: row.id, price: parsed.price, dates: new Set(), seatsTotal: parsed.transport === "aereo" ? 20 : 45 };
      pkgByKey.set(key, pkg);
    }

    const dates = parsed.dates.length
      ? parsed.dates.map((d) => nextOccurrence(d.day, d.month))
      : pkg.dates.size === 0
        ? generatedDates(product.id, parsed.days <= 1)
        : [];

    for (const date of dates) {
      if (pkg.dates.has(date)) continue;
      pkg.dates.add(date);
      const seed = (product.id * 7 + Number(date.slice(-2)) * 13) % 100;
      const seatsTaken = Math.min(pkg.seatsTotal, Math.round((seed / 100) * pkg.seatsTotal));
      await db.insert(schema.departures).values({
        packageId: pkg.id,
        date,
        seatsTotal: pkg.seatsTotal,
        seatsTaken,
        priceOverride: parsed.price !== pkg.price ? parsed.price : null,
      });
      departuresCount++;
    }
  }

  await db.execute(sql`
    update destinations set image = (
      select p.image from packages p where p.destination_id = destinations.id and p.image is not null limit 1
    ) where image is null`);
  await db.execute(sql`
    update packages set image = (
      select d.image from destinations d where d.id = packages.destination_id
    ) where image is null`);

  await db.insert(schema.reviews).values([
    { author: "Reseña de ejemplo · Marta G.", rating: 5, trip: "Puerto Madryn", text: "Reemplazar por una reseña real de Google. Ejemplo: excelente coordinación, el hotel impecable y todo el grupo muy bien atendido." },
    { author: "Reseña de ejemplo · Jorge P.", rating: 5, trip: "Cataratas del Iguazú", text: "Reemplazar por una reseña real de Google. Ejemplo: viajamos en familia y nos resolvieron todo, súper recomendables." },
    { author: "Reseña de ejemplo · Silvia R.", rating: 5, trip: "Villa de Merlo", text: "Reemplazar por una reseña real de Google. Ejemplo: tercera vez que viajo con la agencia, precio justo y mucha atención." },
  ]);

  const anyPackages = await db.select({ id: schema.packages.id }).from(schema.packages).limit(4);
  await db.insert(schema.leads).values([
    { name: "Laura Fernández", phone: "11 5555-0101", passengers: 2, packageId: anyPackages[0]?.id, status: "nuevo", message: "¿Tienen lugar para dos personas en la primera salida?" },
    { name: "Carlos Díaz", phone: "11 5555-0102", passengers: 4, packageId: anyPackages[1]?.id, status: "contactado", message: "Somos dos adultos y dos chicos de 8 y 10 años." },
    { name: "Ana Torres", phone: "11 5555-0103", passengers: 1, packageId: anyPackages[2]?.id, status: "cotizado", message: "Me interesa la modalidad viajo a compartir." },
    { name: "Grupo jubilados Castelar", phone: "11 5555-0104", passengers: 12, packageId: anyPackages[3]?.id, status: "reservado", notes: "Seña recibida por transferencia." },
  ]);

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@ejemplo.com";
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await db
      .insert(schema.users)
      .values({ email: adminEmail, name: "Administrador", passwordHash, role: "admin" })
      .onConflictDoUpdate({ target: schema.users.email, set: { passwordHash } });
  } else {
    console.warn("ADMIN_PASSWORD no definido: no se creó el usuario administrador.");
  }

  console.log(
    `Listo: ${destinationIds.size} destinos, ${pkgByKey.size} paquetes, ${departuresCount} salidas. Admin: ${adminEmail}`,
  );
}

await main();
await pool.end();
