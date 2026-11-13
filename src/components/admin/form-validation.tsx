"use client";

import { useEffect } from "react";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function messageFor(el: Field): string {
  const v = el.validity;
  const input = el instanceof HTMLInputElement ? el : null;
  const type = input?.type ?? "";
  if (v.valueMissing) {
    if (type === "checkbox") return "Marcá esta opción para continuar.";
    if (type === "radio" || el instanceof HTMLSelectElement) return "Elegí una opción.";
    if (type === "file") return "Adjuntá un archivo.";
    if (type === "date") return "Elegí una fecha.";
    return "Este campo es obligatorio.";
  }
  if (v.typeMismatch) {
    if (type === "email") return "Ingresá un email válido (ej: nombre@dominio.com).";
    if (type === "url") return "Ingresá una dirección web completa (ej: https://...).";
    return "El formato no es válido.";
  }
  if (v.badInput) return type === "number" ? "Ingresá solo números." : "El valor no es válido.";
  if (v.rangeUnderflow) return type === "date" ? `La fecha tiene que ser desde ${fmtDate(input!.min)}.` : `El mínimo es ${input!.min}.`;
  if (v.rangeOverflow) return type === "date" ? `La fecha tiene que ser hasta ${fmtDate(input!.max)}.` : `El máximo es ${input!.max}.`;
  if (v.stepMismatch) return "Ingresá un número entero.";
  if (v.tooShort) return `Tiene que tener al menos ${(el as HTMLInputElement).minLength} caracteres.`;
  if (v.tooLong) return `No puede superar ${(el as HTMLInputElement).maxLength} caracteres.`;
  if (v.patternMismatch) return el.title || "El formato no es válido.";
  return el.validationMessage;
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return d ? `${d}/${m}/${y}` : iso;
}

function isField(t: EventTarget | null): t is Field {
  return t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;
}

function anchorFor(el: Field): Element {
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    return el.closest("fieldset") ?? el.closest("label") ?? el;
  }
  return el;
}

function errorNode(el: Field): HTMLElement | null {
  const id = el.getAttribute("aria-describedby")?.split(" ").find((x) => x.startsWith("fv-"));
  return id ? document.getElementById(id) : null;
}

function showError(el: Field) {
  const msg = messageFor(el);
  let node = errorNode(el);
  if (!node) {
    node = document.createElement("p");
    node.id = `fv-${Math.random().toString(36).slice(2, 9)}`;
    node.className = "field-error";
    node.setAttribute("role", "alert");
    anchorFor(el).insertAdjacentElement("afterend", node);
    el.setAttribute("aria-describedby", [el.getAttribute("aria-describedby"), node.id].filter(Boolean).join(" "));
  }
  node.textContent = msg;
  el.setAttribute("aria-invalid", "true");
}

function clearError(el: Field) {
  const node = errorNode(el);
  if (node) {
    const rest = el.getAttribute("aria-describedby")!.split(" ").filter((x) => x !== node.id).join(" ");
    if (rest) el.setAttribute("aria-describedby", rest);
    else el.removeAttribute("aria-describedby");
    node.remove();
  }
  el.removeAttribute("aria-invalid");
}

/** Reemplaza el globito nativo de validación por un mensaje debajo de cada campo. */
export function FormValidation() {
  useEffect(() => {
    let focused = false;

    const onInvalid = (e: Event) => {
      if (!isField(e.target)) return;
      e.preventDefault();
      showError(e.target);
      if (!focused) {
        focused = true;
        e.target.focus({ preventScroll: true });
        anchorFor(e.target).scrollIntoView({ behavior: "smooth", block: "center" });
        queueMicrotask(() => (focused = false));
      }
    };

    const onEdit = (e: Event) => {
      const el = e.target;
      if (!isField(el) || el.getAttribute("aria-invalid") !== "true") return;
      if (el.validity.valid) clearError(el);
      else showError(el);
      if (el instanceof HTMLInputElement && el.type === "radio" && el.form) {
        el.form.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(el.name)}"]`).forEach(clearError);
      }
    };

    const onReset = (e: Event) => {
      const form = e.target as HTMLFormElement;
      form.querySelectorAll<Field>("[aria-invalid=true]").forEach(clearError);
    };

    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    document.addEventListener("reset", onReset, true);
    return () => {
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
      document.removeEventListener("reset", onReset, true);
    };
  }, []);

  return null;
}
