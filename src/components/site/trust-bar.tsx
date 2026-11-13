import { Headset, ShieldCheck, Star, Users } from "lucide-react";
import { interpolate } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { SiteSettings } from "@/lib/settings";

export function TrustBar({ settings, t }: { settings: SiteSettings; t: Dictionary["trust"] }) {
  const items = [
    { icon: Star, title: interpolate(t.google, { rating: settings.googleRating }), text: interpolate(t.googleText, { n: settings.googleReviews }) },
    { icon: Users, title: interpolate(t.years, { n: settings.yearsActive }), text: t.yearsText },
    { icon: Headset, title: t.coordination, text: t.coordinationText },
    { icon: ShieldCheck, title: interpolate(t.legajo, { n: settings.legajo }), text: t.legajoText },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-ink/10 lg:grid-cols-4">
      {items.map(({ icon: Icon, title, text }) => (
        <div key={title} className="flex items-start gap-3 bg-white p-5">
          <Icon className="mt-0.5 size-5 shrink-0 text-sun-dark" aria-hidden />
          <div>
            <p className="font-semibold">{title}</p>
            <p className="text-sm text-ink-soft">{text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
