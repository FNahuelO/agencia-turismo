"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, CalendarDays, Coins, ExternalLink, FileText, Inbox, KeyRound, Landmark, LayoutDashboard, LogOut, Mail, Map, Menu, Package, Plug, ScrollText, Settings, Star, Ticket, X } from "lucide-react";
import { logout } from "@/app/admin/actions";

const NAV = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard, exact: true },
  { href: "/admin/reservas", label: "Reservas", icon: Ticket, badgeKey: "bookings" as const },
  { href: "/admin/consultas", label: "Consultas", icon: Inbox, badgeKey: "leads" as const },
  { href: "/admin/cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/admin/contabilidad", label: "Contabilidad", icon: Landmark },
  { href: "/admin/proveedores", label: "Proveedores", icon: Building2 },
  { href: "/admin/salidas", label: "Salidas y cupos", icon: CalendarDays },
  { href: "/admin/paquetes", label: "Productos", icon: Package },
  { href: "/admin/destinos", label: "Destinos", icon: Map },
  { href: "/admin/politicas", label: "Condiciones", icon: ScrollText },
  { href: "/admin/monedas", label: "Monedas", icon: Coins },
  { href: "/admin/conectores", label: "Conectores", icon: Plug },
  { href: "/admin/emails", label: "Emails", icon: Mail },
  { href: "/admin/api", label: "API", icon: KeyRound },
  { href: "/admin/resenas", label: "Reseñas", icon: Star },
  { href: "/admin/configuracion", label: "Configuración", icon: Settings },
];

type Props = { user: { name: string; role: string }; newLeads: number; bookingAlerts: number };

function Logo() {
  return (
    <Link href="/admin" className="font-display text-xl font-bold text-white">
      TravelAr <span className="text-sun">admin</span>
    </Link>
  );
}

function NavLinks({ badges, onNavigate }: { badges: Record<"leads" | "bookings", number>; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
      {NAV.map(({ href, label, icon: Icon, exact, badgeKey }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white"}`}
          >
            <Icon className="size-4" />
            {label}
            {badgeKey && badges[badgeKey] > 0 && (
              <span className="ml-auto rounded-full bg-sun px-2 py-0.5 text-xs font-bold text-ink">{badges[badgeKey]}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function UserFooter({ user }: { user: Props["user"] }) {
  return (
    <div className="border-t border-white/10 p-4">
      <Link href="/" target="_blank" className="mb-3 flex items-center gap-2 text-sm hover:text-white">
        <ExternalLink className="size-4" /> Ver sitio
      </Link>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{user.name}</p>
          <p className="text-xs capitalize">{user.role}</p>
        </div>
        <form action={logout}>
          <button type="submit" className="rounded-lg p-2 hover:bg-white/10" aria-label="Cerrar sesión" title="Cerrar sesión">
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

export function Sidebar({ user, newLeads, bookingAlerts }: Props) {
  const badges = { leads: newLeads, bookings: bookingAlerts };
  const pending = newLeads + bookingAlerts;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between bg-ink px-4 py-3 text-white/80 shadow-lg shadow-ink/10 lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={open}
          aria-controls="admin-drawer"
          className="relative rounded-xl p-2 text-white hover:bg-white/10"
        >
          <Menu className="size-6" />
          {pending > 0 && <span className="absolute right-1 top-1 size-2.5 rounded-full bg-sun ring-2 ring-ink" />}
        </button>
      </header>

      <div className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-ink/50 backdrop-blur-[2px] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          id="admin-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Menú del panel"
          inert={!open}
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-ink text-white/80 shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex items-center justify-between py-4 pl-6 pr-3">
            <Logo />
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar menú" className="rounded-xl p-2 text-white hover:bg-white/10">
              <X className="size-5" />
            </button>
          </div>
          <NavLinks badges={badges} onNavigate={() => setOpen(false)} />
          <UserFooter user={user} />
        </aside>
      </div>

      <aside className="hidden flex-col bg-ink text-white/80 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64">
        <div className="px-6 py-5">
          <Logo />
        </div>
        <NavLinks badges={badges} />
        <UserFooter user={user} />
      </aside>
    </>
  );
}
