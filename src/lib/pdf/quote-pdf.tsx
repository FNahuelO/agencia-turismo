import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import sharp from "sharp";
import { formatLongDate, formatPrice, toISODate } from "@/lib/format";
import { asLocale, interpolate } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { quoteTotals } from "@/lib/quote-calc";
import type { QuoteWithItems } from "@/lib/quotes";
import type { SiteSettings } from "@/lib/settings";

const INK = "#0d1c38";
const SOFT = "#5b6478";
const LAKE = "#1f6f8b";
const SAND = "#f6f1e9";

const s = StyleSheet.create({
  page: { padding: 40, paddingBottom: 60, fontSize: 10, color: INK, fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 120, height: 41, objectFit: "contain" },
  agency: { textAlign: "right", color: SOFT, fontSize: 9, lineHeight: 1.4 },
  titleBox: { marginTop: 28, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#e3ded4" },
  eyebrow: { fontSize: 9, color: LAKE, fontFamily: "Helvetica-Bold", letterSpacing: 1.2, textTransform: "uppercase" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 4 },
  meta: { flexDirection: "row", gap: 24, marginTop: 10, color: SOFT, fontSize: 9 },
  greeting: { marginTop: 16, lineHeight: 1.5 },
  facts: { flexDirection: "row", gap: 12, marginTop: 14 },
  fact: { flex: 1, backgroundColor: SAND, borderRadius: 6, padding: 10 },
  factLabel: { fontSize: 8, color: SOFT },
  factValue: { marginTop: 3, fontFamily: "Helvetica-Bold" },
  sectionTitle: { marginTop: 22, marginBottom: 6, fontSize: 12, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: "#e3ded4" },
  headRow: { flexDirection: "row", paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: INK, fontSize: 8, color: SOFT },
  colDesc: { flex: 1, paddingRight: 8 },
  colQty: { width: 36, textAlign: "right" },
  colUnit: { width: 80, textAlign: "right" },
  colSub: { width: 86, textAlign: "right" },
  kind: { fontSize: 8, color: LAKE, fontFamily: "Helvetica-Bold" },
  desc: { fontFamily: "Helvetica-Bold", marginTop: 1 },
  detail: { color: SOFT, fontSize: 9, marginTop: 2, lineHeight: 1.4 },
  totals: { marginTop: 12, alignSelf: "flex-end", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grand: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: INK },
  grandValue: { fontSize: 16, fontFamily: "Helvetica-Bold", color: LAKE },
  notes: { marginTop: 22, padding: 12, backgroundColor: SAND, borderRadius: 6, lineHeight: 1.5 },
  small: { marginTop: 14, color: SOFT, fontSize: 8, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 28, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: SOFT },
});

let logoCache: Buffer | null | undefined;

async function logoPng() {
  if (logoCache !== undefined) return logoCache;
  try {
    logoCache = await sharp(await readFile(join(process.cwd(), "public", "logo.webp"))).png().toBuffer();
  } catch {
    logoCache = null;
  }
  return logoCache;
}

/** Helvetica estándar solo cubre Latin-1: se normalizan espacios y signos que Intl puede devolver fuera de ese rango. */
function clean(text: string) {
  return text.replace(/[\u202f\u2009]/g, " ").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"');
}

export async function renderQuotePdf(quote: QuoteWithItems, settings: SiteSettings) {
  const locale = asLocale(quote.locale);
  const t = getDictionary(locale);
  const q = t.quote;
  const logo = await logoPng();
  const fmt = (n: number) => clean(formatPrice(n, quote.currency));
  const date = (iso: string) => clean(formatLongDate(iso, locale));
  const totals = quoteTotals(quote.items, quote.passengers);

  const doc = (
    <Document title={`${q.title} ${quote.code} · ${quote.title}`} author={settings.brandName} language={locale}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          {logo ? <Image src={{ data: logo, format: "png" }} style={s.logo} /> : <Text style={s.title}>{settings.brandName}</Text>}
          <View style={s.agency}>
            <Text style={{ fontFamily: "Helvetica-Bold", color: INK }}>{settings.brandName}</Text>
            <Text>{settings.address}, {settings.city}</Text>
            <Text>{settings.phone} · {settings.email}</Text>
            <Text>{interpolate(q.licensed, { n: settings.legajo })}</Text>
          </View>
        </View>

        <View style={s.titleBox}>
          <Text style={s.eyebrow}>{q.title} {quote.code}</Text>
          <Text style={s.title}>{quote.title}</Text>
          <View style={s.meta}>
            <Text>{interpolate(q.issued, { date: date(toISODate(quote.createdAt)) })}</Text>
            <Text>{interpolate(q.validUntil, { date: date(quote.validUntil) })}</Text>
          </View>
        </View>

        <Text style={s.greeting}>{interpolate(q.greeting, { name: quote.clientName })}</Text>

        <View style={s.facts}>
          {quote.travelDate && (
            <View style={s.fact}>
              <Text style={s.factLabel}>{q.travelDate}</Text>
              <Text style={s.factValue}>{date(quote.travelDate)}</Text>
            </View>
          )}
          <View style={s.fact}>
            <Text style={s.factLabel}>{q.passengers}</Text>
            <Text style={s.factValue}>{quote.passengers}</Text>
          </View>
          <View style={s.fact}>
            <Text style={s.factLabel}>{q.perPax}</Text>
            <Text style={s.factValue}>{fmt(totals.perPassenger)}</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>{q.services}</Text>
        <View style={s.headRow}>
          <Text style={s.colDesc}> </Text>
          <Text style={s.colQty}>{q.qty}</Text>
          <Text style={s.colUnit}>{q.unit}</Text>
          <Text style={s.colSub}>{q.subtotal}</Text>
        </View>
        {quote.items.map((item) => {
          const dates = [item.dateFrom, item.dateTo].filter((d): d is string => Boolean(d)).map(date).join(" – ");
          return (
            <View key={item.id} style={s.row} wrap={false}>
              <View style={s.colDesc}>
                <Text style={s.kind}>{q.kinds[item.kind].toUpperCase()}</Text>
                <Text style={s.desc}>{item.description}</Text>
                {(item.detail || dates) && <Text style={s.detail}>{[dates, item.detail].filter(Boolean).join(" · ")}</Text>}
              </View>
              <Text style={s.colQty}>{item.quantity}</Text>
              <Text style={s.colUnit}>{fmt(item.unitPrice)}</Text>
              <Text style={s.colSub}>{fmt(item.unitPrice * item.quantity)}</Text>
            </View>
          );
        })}

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text style={{ color: SOFT }}>{q.perPax}</Text>
            <Text>{fmt(totals.perPassenger)}</Text>
          </View>
          <View style={s.grand}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{q.total}</Text>
            <Text style={s.grandValue}>{fmt(totals.total)}</Text>
          </View>
        </View>

        {quote.notes && (
          <View style={s.notes} wrap={false}>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>{q.notes}</Text>
            <Text>{clean(quote.notes)}</Text>
          </View>
        )}

        <Text style={s.small}>{interpolate(q.pricesNote, { currency: quote.currency })}</Text>

        <View style={s.footer} fixed>
          <Text>{settings.brandName} · {quote.code}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
