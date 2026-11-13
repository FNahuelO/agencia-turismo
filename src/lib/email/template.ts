/** Plantilla HTML simple (tablas e estilos inline, para que se vea bien en Gmail y Outlook) y su versión texto. */

export type EmailContent = {
  brand: string;
  preheader?: string;
  title: string;
  paragraphs: string[];
  rows?: [string, string][];
  /** Bloque destacado (por ejemplo, datos bancarios). */
  box?: { title: string; rows: [string, string][] };
  buttons?: { label: string; url: string }[];
  footer: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const COLOR = { ink: "#1c2430", soft: "#5b6573", lake: "#0e6e8c", sand: "#f6f1e9", line: "#e7e2da" };

function rowsTable(rows: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid ${COLOR.line};color:${COLOR.soft};font-size:14px">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid ${COLOR.line};text-align:right;font-size:14px;font-weight:600">${esc(v)}</td></tr>`,
    )
    .join("")}</table>`;
}

export function renderEmail(c: EmailContent) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(c.title)}</title></head>
<body style="margin:0;background:${COLOR.sand};font-family:Arial,Helvetica,sans-serif;color:${COLOR.ink}">
${c.preheader ? `<div style="display:none;max-height:0;overflow:hidden">${esc(c.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px">
<tr><td style="padding:24px 28px;border-bottom:1px solid ${COLOR.line};font-size:18px;font-weight:700;color:${COLOR.lake}">${esc(c.brand)}</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${esc(c.title)}</h1>
${c.paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">${esc(p)}</p>`).join("")}
${c.rows?.length ? rowsTable(c.rows) : ""}
${
  c.box
    ? `<div style="margin:16px 0;padding:16px;background:${COLOR.sand};border-radius:12px"><p style="margin:0;font-weight:700;font-size:14px">${esc(c.box.title)}</p>${rowsTable(c.box.rows)}</div>`
    : ""
}
${(c.buttons ?? [])
  .map(
    (b, i) =>
      `<a href="${esc(b.url)}" style="display:inline-block;margin:8px 8px 0 0;padding:12px 20px;border-radius:999px;font-weight:700;font-size:14px;text-decoration:none;${
        i === 0 ? `background:${COLOR.lake};color:#fff` : `border:1px solid ${COLOR.line};color:${COLOR.ink}`
      }">${esc(b.label)}</a>`,
  )
  .join("")}
</td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid ${COLOR.line};font-size:12px;line-height:1.5;color:${COLOR.soft}">${esc(c.footer)}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    c.title,
    "",
    ...c.paragraphs,
    ...(c.rows?.length ? ["", ...c.rows.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(c.box ? ["", c.box.title, ...c.box.rows.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(c.buttons ?? []).map((b) => `\n${b.label}: ${b.url}`),
    "",
    "--",
    c.footer,
  ].join("\n");

  return { html, text };
}
