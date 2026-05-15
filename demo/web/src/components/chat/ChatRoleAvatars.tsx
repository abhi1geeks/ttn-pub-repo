/** Small inline SVG avatars for the floating assistant (no external image assets). */

import type { ReactNode } from "react";

export function ChatBotGlyph({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="4" y="6" width="16" height="13" rx="3" className="fill-emerald-600" />
      <circle cx="9" cy="12" r="1.5" className="fill-white" />
      <circle cx="15" cy="12" r="1.5" className="fill-white" />
      <path d="M9 15.5h6" className="stroke-white" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M12 3v3" className="stroke-emerald-700" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="2" r="1" className="fill-emerald-500" />
    </svg>
  );
}

export function UserQueryGlyph({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="12" cy="9" r="4" className="fill-zinc-600" />
      <path
        d="M6 20c0-3.5 2.5-6 6-6s6 2.5 6 6"
        className="stroke-zinc-600"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AssistantResponseGlyph({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="3" y="5" width="14" height="11" rx="2" className="fill-emerald-600" />
      <path d="M17 9h2.5a1.5 1.5 0 011.5 1.5v4a1.5 1.5 0 01-1.5 1.5H17" className="stroke-emerald-700" strokeWidth="1.5" fill="none" />
      <circle cx="8" cy="10.5" r="1" className="fill-white" />
      <circle cx="12" cy="10.5" r="1" className="fill-white" />
      <path d="M8 14h4" className="stroke-white" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function ringWrap(
  children: ReactNode,
  {
    bg,
    border,
    size = "h-8 w-8",
    label,
  }: { bg: string; border: string; size?: string; label: string },
) {
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border shadow-sm ${size} ${bg} ${border}`}
    >
      {children}
    </span>
  );
}

export function ChatBotAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dim = size === "lg" ? "h-11 w-11" : size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const glyph = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return ringWrap(<ChatBotGlyph className={glyph} />, {
    bg: "bg-emerald-50",
    border: "border-emerald-200/90",
    size: dim,
    label: "Assistant",
  });
}

export function UserQueryAvatar({ size = "sm" }: { size?: "sm" | "md" }) {
  const dim = size === "md" ? "h-10 w-10" : "h-8 w-8";
  const g = size === "md" ? "h-5 w-5" : "h-4 w-4";
  return ringWrap(<UserQueryGlyph className={g} />, {
    bg: "bg-zinc-100",
    border: "border-zinc-300/90",
    size: dim,
    label: "Your message",
  });
}

export function AssistantResponseAvatar({ size = "sm" }: { size?: "sm" | "md" }) {
  const dim = size === "md" ? "h-10 w-10" : "h-8 w-8";
  const g = size === "md" ? "h-5 w-5" : "h-4 w-4";
  return ringWrap(<AssistantResponseGlyph className={g} />, {
    bg: "bg-white",
    border: "border-emerald-200/90",
    size: dim,
    label: "Assistant reply",
  });
}
