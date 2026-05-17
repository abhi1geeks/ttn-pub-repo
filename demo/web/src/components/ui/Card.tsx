import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={`rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm ring-1 ring-zinc-100 ${className}`}
    >
      {children}
    </div>
  );
}
