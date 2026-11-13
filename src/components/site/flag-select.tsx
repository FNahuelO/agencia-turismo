"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export type FlagOption<T extends string> = {
  value: T;
  /** Texto corto del botón (ej: "ES", "USD"). */
  short: string;
  label: string;
  icon: React.ReactNode;
};

export function FlagSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  align = "right",
}: {
  align?: "left" | "right";
  value: T;
  options: FlagOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    list.current?.focus();
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const toggle = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen((o) => !o);
  };

  const pick = (v: T) => {
    setOpen(false);
    root.current?.querySelector("button")?.focus();
    if (v !== value) onChange(v);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") setActive((i) => (i + 1) % options.length);
    else if (e.key === "ArrowUp") setActive((i) => (i - 1 + options.length) % options.length);
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(options.length - 1);
    else if (e.key === "Enter" || e.key === " ") pick(options[active].value);
    else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      if (e.key === "Escape") root.current?.querySelector("button")?.focus();
      return;
    } else return;
    e.preventDefault();
  };

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) toggle();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${ariaLabel}: ${current.label}`}
        className="flex w-full items-center gap-2 rounded-full border border-ink/10 bg-white py-2 pl-2.5 pr-2 text-sm font-medium text-ink-soft transition hover:border-ink/20 hover:text-ink"
      >
        {current.icon}
        <span>{current.short}</span>
        <ChevronDown className={`ml-auto size-3.5 opacity-60 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onKey}
          className={`absolute ${align === "left" ? "left-0" : "right-0"} z-50 mt-2 min-w-full w-max overflow-hidden rounded-lg border border-ink/10 bg-white p-1.5 shadow-xl shadow-ink/10 outline-none`}
        >
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                onClick={() => pick(o.value)}
                onPointerMove={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm ${i === active ? "bg-ink/5" : ""} ${selected ? "font-semibold text-ink" : "text-ink-soft"}`}
              >
                {o.icon}
                <span className="flex-1">{o.label}</span>
                <Check className={`size-4 text-lake ${selected ? "" : "invisible"}`} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
