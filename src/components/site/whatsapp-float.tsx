import { brandWhatsappMessage, whatsappLink } from "@/lib/whatsapp";
import type { Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { WhatsAppIcon } from "./icons";

export function WhatsAppFloat({ number, brand, locale }: { number: string; brand: string; locale: Locale }) {
  const t = getDictionary(locale);
  return (
    <a
      href={whatsappLink(number, brandWhatsappMessage(t.wa.general, brand))}
      target="_blank"
      rel="noopener"
      aria-label={t.nav.whatsapp}
      data-event="whatsapp_click"
      data-location="float"
      className="fixed right-4 bottom-4 z-50 flex size-14 items-center justify-center rounded-full bg-[#1f9d55] text-white shadow-lg shadow-black/20 transition-colors duration-150 hover:bg-[#178246] sm:right-6 sm:bottom-6"
    >
      <WhatsAppIcon className="size-7" />
    </a>
  );
}
