import { useId } from "react";

export type FlagCode = "ar" | "us" | "br" | "eu";

function Frame({ children, className }: { children: React.ReactNode; className: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 30 20" aria-hidden className={`shrink-0 rounded-[3px] shadow-[0_0_0_1px_rgb(0_0_0/0.08)] ${className}`}>
      <clipPath id={id}>
        <rect width="30" height="20" rx="2" />
      </clipPath>
      <g clipPath={`url(#${id})`}>{children}</g>
    </svg>
  );
}

const EU_STARS = Array.from({ length: 12 }, (_, i) => {
  const a = (i * Math.PI) / 6;
  return [15 + 6 * Math.cos(a), 10 + 6 * Math.sin(a)] as const;
});

export function Flag({ code, className = "h-4 w-6" }: { code: FlagCode; className?: string }) {
  switch (code) {
    case "ar":
      return (
        <Frame className={className}>
          <rect width="30" height="20" fill="#74ACDF" />
          <rect y="6.67" width="30" height="6.67" fill="#fff" />
          <circle cx="15" cy="10" r="2.2" fill="#F6B40E" stroke="#85340A" strokeWidth="0.3" />
        </Frame>
      );
    case "us":
      return (
        <Frame className={className}>
          <rect width="30" height="20" fill="#fff" />
          {[0, 2, 4, 6, 8, 10, 12].map((i) => (
            <rect key={i} y={(i * 20) / 13} width="30" height={20 / 13} fill="#B22234" />
          ))}
          <rect width="12" height={(7 * 20) / 13} fill="#3C3B6E" />
          {[2, 6, 10].flatMap((x) => [2.5, 5.5, 8.5].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.6" fill="#fff" />))}
        </Frame>
      );
    case "br":
      return (
        <Frame className={className}>
          <rect width="30" height="20" fill="#009C3B" />
          <path d="M15 2.5 27 10 15 17.5 3 10Z" fill="#FFDF00" />
          <circle cx="15" cy="10" r="4" fill="#002776" />
          <path d="M11.2 9.2c2.6-.6 5.4-.3 7.7.9" stroke="#fff" strokeWidth="0.7" fill="none" />
        </Frame>
      );
    case "eu":
      return (
        <Frame className={className}>
          <rect width="30" height="20" fill="#003399" />
          {EU_STARS.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="0.85" fill="#FFCC00" />
          ))}
        </Frame>
      );
  }
}
