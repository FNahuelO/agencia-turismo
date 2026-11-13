import type { Locale } from "@/lib/i18n/config";

/** Textos de los emails al pasajero. Los avisos internos van solo en español. */
const es = {
  greeting: "Hola {name},",
  footer: "Este email lo envió automáticamente {brand}. Si tenés dudas, respondé este mensaje o escribinos por WhatsApp al {phone}.",
  viewBooking: "Ver mi reserva",
  rows: {
    code: "Reserva",
    trip: "Viaje",
    date: "Fecha",
    stay: "Estadía",
    passengers: "Pasajeros",
    total: "Total",
    paid: "Pagado",
    balance: "Saldo",
    deposit: "Seña",
    deadline: "Pagar la seña antes del",
    balanceDue: "Vencimiento del saldo",
  },
  nights: "{n} noches",
  bank: { title: "Datos para transferir", bank: "Banco", holder: "Titular", cuit: "CUIT", cbu: "CBU / CVU", alias: "Alias", hint: "Después de transferir, subí el comprobante desde el link de tu reserva." },
  created: {
    subject: "Reserva {code} recibida · {title}",
    title: "¡Recibimos tu reserva!",
    deposit: "Tu reserva quedó registrada. Para confirmarla, aboná la seña de {deposit} antes del {deadline}.",
    noDeadline: "Tu reserva quedó registrada. Desde el link podés ver el detalle y pagar.",
  },
  payment: {
    subject: "Recibimos tu pago · reserva {code}",
    title: "¡Pago acreditado!",
    intro: "Acreditamos un pago de {amount} en tu reserva {code}.",
    confirmed: "Tu reserva está confirmada. Queda un saldo de {balance}.",
    confirmedDue: "Tu reserva está confirmada. El saldo de {balance} vence el {date}.",
    paid: "Tu reserva está paga en su totalidad. ¡Buen viaje!",
    pending: "Todavía falta completar la seña: quedan {deposit}.",
  },
  reminderDeposit: {
    subject: "Tu reserva {code} vence pronto",
    title: "Te recordamos la seña",
    intro: "Todavía no registramos el pago de la seña ({deposit}). Si no se acredita antes del {deadline}, los lugares se liberan.",
  },
  reminderBalance: {
    subject: "Recordatorio de saldo · reserva {code}",
    title: "Se acerca el vencimiento del saldo",
    intro: "El saldo de {balance} de tu reserva vence el {date}. Podés pagarlo desde el link de la reserva.",
  },
  expired: {
    subject: "Tu reserva {code} venció",
    title: "Tu reserva venció",
    intro: "El plazo para abonar la seña terminó y los lugares se liberaron. Si todavía querés viajar, escribinos y revisamos la disponibilidad.",
  },
  cancelled: {
    subject: "Reserva {code} cancelada",
    title: "Tu reserva fue cancelada",
    intro: "Cancelamos la reserva {code}. Si hiciste pagos, nos vamos a comunicar por el reintegro según las condiciones del viaje.",
  },
  quote: {
    subject: "Tu cotización {code} · {title}",
    title: "Te preparamos una propuesta",
    intro: "Armamos la cotización «{title}» para {passengers} pasajeros.",
    total: "Total: {total} ({perPerson} por persona). Válida hasta el {date}.",
    view: "Ver la cotización",
    pdf: "Descargar PDF",
  },
};

export type EmailDictionary = typeof es;

const en: EmailDictionary = {
  greeting: "Hi {name},",
  footer: "This email was sent automatically by {brand}. If you have any questions, reply to this message or message us on WhatsApp at {phone}.",
  viewBooking: "View my booking",
  rows: {
    code: "Booking",
    trip: "Trip",
    date: "Date",
    stay: "Stay",
    passengers: "Travelers",
    total: "Total",
    paid: "Paid",
    balance: "Balance",
    deposit: "Deposit",
    deadline: "Pay the deposit before",
    balanceDue: "Balance due",
  },
  nights: "{n} nights",
  bank: { title: "Bank transfer details", bank: "Bank", holder: "Account holder", cuit: "Tax ID (CUIT)", cbu: "CBU / CVU", alias: "Alias", hint: "After the transfer, upload the receipt from your booking link." },
  created: {
    subject: "Booking {code} received · {title}",
    title: "We received your booking!",
    deposit: "Your booking has been registered. To confirm it, pay the {deposit} deposit before {deadline}.",
    noDeadline: "Your booking has been registered. Use the link to see the details and pay.",
  },
  payment: {
    subject: "Payment received · booking {code}",
    title: "Payment credited!",
    intro: "We credited a payment of {amount} to your booking {code}.",
    confirmed: "Your booking is confirmed. The remaining balance is {balance}.",
    confirmedDue: "Your booking is confirmed. The balance of {balance} is due on {date}.",
    paid: "Your booking is fully paid. Have a great trip!",
    pending: "The deposit is not complete yet: {deposit} left.",
  },
  reminderDeposit: {
    subject: "Your booking {code} expires soon",
    title: "Deposit reminder",
    intro: "We haven't received the deposit ({deposit}) yet. If it isn't credited before {deadline}, the seats will be released.",
  },
  reminderBalance: {
    subject: "Balance reminder · booking {code}",
    title: "Your balance is due soon",
    intro: "The balance of {balance} for your booking is due on {date}. You can pay it from your booking link.",
  },
  expired: {
    subject: "Your booking {code} expired",
    title: "Your booking expired",
    intro: "The deposit deadline passed and the seats were released. If you still want to travel, contact us and we'll check availability.",
  },
  cancelled: {
    subject: "Booking {code} cancelled",
    title: "Your booking was cancelled",
    intro: "We cancelled booking {code}. If you made payments, we'll contact you about the refund according to the trip conditions.",
  },
  quote: {
    subject: "Your quote {code} · {title}",
    title: "We prepared a proposal for you",
    intro: "Here is the quote “{title}” for {passengers} travelers.",
    total: "Total: {total} ({perPerson} per person). Valid until {date}.",
    view: "View the quote",
    pdf: "Download PDF",
  },
};

const pt: EmailDictionary = {
  greeting: "Olá {name},",
  footer: "Este email foi enviado automaticamente por {brand}. Se tiver dúvidas, responda esta mensagem ou fale conosco pelo WhatsApp {phone}.",
  viewBooking: "Ver minha reserva",
  rows: {
    code: "Reserva",
    trip: "Viagem",
    date: "Data",
    stay: "Estadia",
    passengers: "Passageiros",
    total: "Total",
    paid: "Pago",
    balance: "Saldo",
    deposit: "Sinal",
    deadline: "Pagar o sinal antes de",
    balanceDue: "Vencimento do saldo",
  },
  nights: "{n} noites",
  bank: { title: "Dados para transferência", bank: "Banco", holder: "Titular", cuit: "CUIT", cbu: "CBU / CVU", alias: "Alias", hint: "Depois de transferir, envie o comprovante pelo link da sua reserva." },
  created: {
    subject: "Reserva {code} recebida · {title}",
    title: "Recebemos sua reserva!",
    deposit: "Sua reserva foi registrada. Para confirmá-la, pague o sinal de {deposit} antes de {deadline}.",
    noDeadline: "Sua reserva foi registrada. Pelo link você vê os detalhes e pode pagar.",
  },
  payment: {
    subject: "Recebemos seu pagamento · reserva {code}",
    title: "Pagamento creditado!",
    intro: "Creditamos um pagamento de {amount} na sua reserva {code}.",
    confirmed: "Sua reserva está confirmada. Falta um saldo de {balance}.",
    confirmedDue: "Sua reserva está confirmada. O saldo de {balance} vence em {date}.",
    paid: "Sua reserva está totalmente paga. Boa viagem!",
    pending: "O sinal ainda não está completo: faltam {deposit}.",
  },
  reminderDeposit: {
    subject: "Sua reserva {code} vence em breve",
    title: "Lembrete do sinal",
    intro: "Ainda não registramos o pagamento do sinal ({deposit}). Se não for creditado antes de {deadline}, os lugares serão liberados.",
  },
  reminderBalance: {
    subject: "Lembrete de saldo · reserva {code}",
    title: "O vencimento do saldo está próximo",
    intro: "O saldo de {balance} da sua reserva vence em {date}. Você pode pagar pelo link da reserva.",
  },
  expired: {
    subject: "Sua reserva {code} venceu",
    title: "Sua reserva venceu",
    intro: "O prazo para pagar o sinal terminou e os lugares foram liberados. Se ainda quiser viajar, fale conosco e verificamos a disponibilidade.",
  },
  cancelled: {
    subject: "Reserva {code} cancelada",
    title: "Sua reserva foi cancelada",
    intro: "Cancelamos a reserva {code}. Se você fez pagamentos, entraremos em contato sobre o reembolso conforme as condições da viagem.",
  },
  quote: {
    subject: "Sua cotação {code} · {title}",
    title: "Preparamos uma proposta para você",
    intro: "Aqui está a cotação “{title}” para {passengers} passageiros.",
    total: "Total: {total} ({perPerson} por pessoa). Válida até {date}.",
    view: "Ver a cotação",
    pdf: "Baixar PDF",
  },
};

const DICTS: Record<Locale, EmailDictionary> = { es, en, pt };

export function emailDictionary(locale: Locale) {
  return DICTS[locale];
}
