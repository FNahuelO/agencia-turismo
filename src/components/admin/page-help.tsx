"use client";

import { CircleHelp, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

type Help = { summary: string; points: string[] };

/** Ayuda de cada pantalla del admin, por ruta (`[id]` = cualquier detalle). */
const HELP: Record<string, Help> = {
  "": {
    summary: "El tablero de inicio: muestra cómo viene el negocio de un vistazo.",
    points: [
      "Consultas, reservas y ventas de los últimos 30 días.",
      "Las próximas salidas con su ocupación, para ver qué falta vender.",
      "Las consultas nuevas que todavía nadie atendió.",
    ],
  },
  reservas: {
    summary: "Todas las reservas: las que hacen los pasajeros en la web, las que llegan por la API y las que cargás desde la oficina.",
    points: [
      "Arriba aparecen las alertas: comprobantes para revisar, pagos con problemas y reservas que vencen en las próximas 12 horas.",
      "Con «Nueva reserva» cargás una venta de mostrador o de WhatsApp; ocupa el cupo igual que una reserva online.",
      "Filtrá por estado o buscá por código, nombre, email o teléfono.",
      "Las reservas pendientes sin seña vencen solas y liberan los lugares.",
    ],
  },
  "reservas/[id]": {
    summary: "El detalle de una reserva: todo lo que pasó con ella y las acciones para gestionarla.",
    points: [
      "Pagos: aprobá o rechazá comprobantes, registrá cobros en efectivo o transferencia y marcá reintegros.",
      "Costos de proveedores: cargá lo que le debés a cada proveedor por este viaje para ver el margen real.",
      "Podés editar el titular y los pasajeros, extender el plazo de la seña, cambiar la fecha o cancelarla (libera el cupo).",
      "El historial y la lista de emails muestran cada cambio y cada aviso enviado.",
    ],
  },
  consultas: {
    summary: "Los pedidos de información que llegan desde el formulario del sitio, WhatsApp y las reservas.",
    points: [
      "Cambiá el estado a medida que avanzás: nueva, contactado, cotizado, reservado o perdido.",
      "Con «Cotizar» armás una cotización con los datos del cliente ya cargados.",
      "Podés exportar la lista a CSV.",
    ],
  },
  cotizaciones: {
    summary: "Propuestas de viaje a medida para mandar a un cliente antes de que reserve.",
    points: [
      "Creá una desde cero, desde una salida del catálogo o desde una consulta.",
      "El cliente la ve con un link (y en PDF), y puede aceptarla o rechazarla.",
      "Las cotizaciones abiertas que pasan la fecha de validez se muestran como vencidas.",
    ],
  },
  "cotizaciones/[id]": {
    summary: "El armado de una cotización: servicios, precios, margen y envío al cliente.",
    points: [
      "Cargá cada servicio con su costo y su precio de venta (o un % de markup); el margen se calcula solo.",
      "Si el servicio lo presta otro, completá el proveedor: al convertirla en reserva se carga la deuda con él.",
      "Mandala por email o WhatsApp, o copiá el link. «Ver como cliente» no la marca como vista.",
      "Si tiene una salida del catálogo, «Convertir en reserva» ocupa el cupo y crea la reserva.",
    ],
  },
  contabilidad: {
    summary: "La caja y los resultados del mes, armados con los cobros, los pagos y los movimientos que cargues.",
    points: [
      "Los cobros aprobados de las reservas entran solos; acá cargás gastos, sueldos, alquiler y otros movimientos.",
      "Saldos por cuenta: caja (efectivo), banco y Mercado Pago, por moneda.",
      "Rentabilidad: venta, costos y margen de cada viaje que sale en el mes.",
      "También muestra lo que falta cobrar, lo que se debe a proveedores y exporta el libro de caja a CSV.",
    ],
  },
  proveedores: {
    summary: "Hoteles, transportes, operadores y demás empresas a las que les comprás servicios.",
    points: [
      "Cada proveedor muestra cuánto le debés en cada moneda.",
      "Entrá a uno para cargar costos y registrar los pagos que le hacés.",
    ],
  },
  "proveedores/[id]": {
    summary: "La cuenta corriente con un proveedor.",
    points: [
      "Costos: lo que le debés, con vencimiento y, si querés, asociado a una reserva para calcular su margen.",
      "Pagos: imputados a un costo o a cuenta. El pago tiene que estar en la moneda del costo.",
      "Anular un costo lo saca de la deuda sin borrarlo del historial.",
    ],
  },
  salidas: {
    summary: "Las fechas de salida de los paquetes y cuántos lugares quedan.",
    points: [
      "Sumá o restá lugares vendidos con un clic (por ejemplo, ventas que no pasaron por el sistema).",
      "El sitio muestra «últimos lugares» y «agotada» automáticamente según el cupo.",
    ],
  },
  paquetes: {
    summary: "Todo lo que se vende en el sitio: paquetes con salidas fijas, excursiones, traslados y hoteles.",
    points: [
      "Filtrá por tipo y creá productos nuevos con los botones de arriba.",
      "Los paquetes tienen fechas de salida; excursiones, traslados y hoteles se reservan cualquier día habilitado.",
      "Un producto despublicado no se ve en el sitio pero conserva sus reservas.",
    ],
  },
  "paquetes/[id]": {
    summary: "La ficha de un producto: lo que ve el pasajero en el sitio y cómo se reserva.",
    points: [
      "Textos, fotos, precio, condiciones y traducciones al inglés y al portugués.",
      "Paquetes: cargá las fechas de salida con su cupo.",
      "Excursiones, traslados y hoteles: elegí los días habilitados y fijá tarifas o cupos especiales por rango de fechas.",
    ],
  },
  destinos: {
    summary: "Los lugares que se muestran en el sitio y agrupan los productos.",
    points: ["Cada destino tiene su página con descripción, foto y los productos que salen hacia ahí."],
  },
  "destinos/[id]": {
    summary: "La página de un destino en el sitio.",
    points: ["Editá el nombre, la región, la descripción, la foto y las traducciones."],
  },
  politicas: {
    summary: "Las condiciones de reserva y cancelación que se asignan a cada producto.",
    points: [
      "Definen el % de seña, cuántas horas hay para pagarla y cuántos días antes de viajar vence el saldo.",
      "Los textos de cancelación se muestran en la ficha y en el checkout.",
    ],
  },
  monedas: {
    summary: "Las cotizaciones de dólar y euro que usa el sitio para convertir precios y cobrar.",
    points: [
      "Elegí la fuente de cada moneda: el dólar puede tomar el oficial, el blue, el MEP, el tarjeta o un valor manual; el euro, el oficial o uno manual.",
      "El margen se suma a la cotización para cubrirte de la variación.",
      "Las automáticas se actualizan cada hora; también podés forzarlo con el botón.",
    ],
  },
  conectores: {
    summary: "Búsqueda y reserva en proveedores externos (hoteles, aéreos, excursiones y traslados).",
    points: [
      "Hoy responde un proveedor simulado para probar el circuito; los reales se suman con contrato y credenciales.",
      "Reservar confirma en el proveedor y carga el costo neto como deuda.",
      "«Sumar a una cotización» agrega la tarifa como un servicio, sin reservar.",
      "El margen de cada conector se suma al neto para calcular el precio de venta.",
    ],
  },
  "conectores/[id]": {
    summary: "Una reserva hecha en un proveedor externo.",
    points: [
      "Muestra el localizador del proveedor, la venta, el costo neto y el margen.",
      "Cancelar la anula en el proveedor y anula el costo, salvo que ya tenga pagos.",
    ],
  },
  emails: {
    summary: "Los emails automáticos que manda el sistema a los pasajeros y a la agencia.",
    points: [
      "Revisá si cada envío salió, falló o no se mandó, y reintentá los que fallaron.",
      "Con «Probar» comprobás que Resend esté bien configurado.",
      "Los envíos se activan y desactivan en Configuración → Emails.",
    ],
  },
  api: {
    summary: "Claves para que otros sistemas (sitios de terceros, apps o integraciones) lean el catálogo y carguen reservas.",
    points: [
      "Cada clave tiene permisos: leer el catálogo, ver sus reservas o crear reservas.",
      "La clave completa se muestra una sola vez al crearla; guardala en un lugar seguro.",
      "Revocá una clave para cortarle el acceso al instante. Abajo está la documentación con ejemplos.",
    ],
  },
  resenas: {
    summary: "Las reseñas de clientes que se muestran en el sitio.",
    points: [
      "Se pueden traer de Google automáticamente o cargar a mano.",
      "Elegí cuáles se publican, el puntaje mínimo y cuántas aparecen en la home.",
    ],
  },
  configuracion: {
    summary: "Los datos generales del sitio y del equipo.",
    points: [
      "Contacto, dirección, textos de la home y sus traducciones.",
      "Reservas online, datos bancarios para transferencias y emails automáticos.",
      "Usuarios del panel: los administradores pueden crear y quitar accesos.",
    ],
  },
};

function helpFor(pathname: string) {
  const parts = pathname.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
  const key = parts.length > 1 ? `${parts[0]}/[id]` : (parts[0] ?? "");
  return HELP[key];
}

export function PageHelp() {
  const help = helpFor(usePathname());
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!help) return null;
  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        aria-label="¿Qué hace esta página?"
        title="¿Qué hace esta página?"
        className="rounded-full p-1 text-ink-soft transition hover:bg-ink/5 hover:text-lake"
      >
        <CircleHelp className="size-5" />
      </button>
      {open && (
        <div id={id} role="dialog" className="fixed inset-x-4 top-20 z-50 sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-80 rounded-2xl bg-white p-5 text-sm font-normal shadow-xl ring-1 ring-ink/10">
          <div className="mb-2 flex items-start justify-between gap-3">
            <p className="font-semibold text-ink">{help.summary}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="shrink-0 text-ink-soft hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
          <ul className="list-disc space-y-1.5 pl-4 text-ink-soft">
            {help.points.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
