import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AgentsPanel } from "./AgentsPanel";
import { ChatBotAvatar, ChatBotGlyph } from "./chat/ChatRoleAvatars";

const STORAGE_KEY = "regulatory-assistant-dock-size";
const STORAGE_VERSION = 1;

/** Default width (~28rem) — used on first open and after “reset size”. */
const DEFAULT_WIDTH_PX = 448;
/** Default height: cap below full viewport so FAB + padding stay clear. */
const DEFAULT_HEIGHT_RATIO = 0.88;
const DEFAULT_HEIGHT_MAX_PX = 46 * 16;

const MIN_WIDTH_PX = 300;
const MIN_HEIGHT_PX = 380;
/** Max width: ~56rem but never wider than viewport minus padding. */
const MAX_WIDTH_CAP_PX = 896;
/** Max height: fraction of viewport (leave room for browser chrome + FAB). */
const MAX_HEIGHT_VIEWPORT_RATIO = 0.92;
const MAX_HEIGHT_CAP_PX = 900;

type Props = {
  documentUrl: string;
  compareBaselineText?: string;
  compareCurrentText?: string;
  compareChunkChanges?: { kind: "added" | "removed"; chunk_index: number | null; excerpt: string }[];
};

type DockSize = { w: number; h: number };

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function viewportMaxWidth(): number {
  if (typeof window === "undefined") return MAX_WIDTH_CAP_PX;
  return Math.min(MAX_WIDTH_CAP_PX, window.innerWidth - 20);
}

function viewportMaxHeight(): number {
  if (typeof window === "undefined") return DEFAULT_HEIGHT_MAX_PX;
  return Math.min(
    Math.round(window.innerHeight * MAX_HEIGHT_VIEWPORT_RATIO),
    MAX_HEIGHT_CAP_PX,
  );
}

function defaultHeightPx(): number {
  if (typeof window === "undefined") return 640;
  return Math.round(Math.min(window.innerHeight * DEFAULT_HEIGHT_RATIO, DEFAULT_HEIGHT_MAX_PX));
}

function defaultSize(): DockSize {
  return { w: DEFAULT_WIDTH_PX, h: defaultHeightPx() };
}

function clampSize(s: DockSize): DockSize {
  return {
    w: clamp(s.w, MIN_WIDTH_PX, viewportMaxWidth()),
    h: clamp(s.h, MIN_HEIGHT_PX, viewportMaxHeight()),
  };
}

function readStoredSize(): DockSize | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { v?: number; w?: unknown; h?: unknown };
    if (p.v !== STORAGE_VERSION || typeof p.w !== "number" || typeof p.h !== "number") return null;
    if (!Number.isFinite(p.w) || !Number.isFinite(p.h)) return null;
    return clampSize({ w: p.w, h: p.h });
  } catch {
    return null;
  }
}

function persistSize(s: DockSize): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: STORAGE_VERSION, w: s.w, h: s.h }),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

function ResizeGripIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="text-white/70" aria-hidden>
      <path
        fill="currentColor"
        d="M4 20h2v-2H4v2zm4 0h2v-4H8v4zm4 0h2v-6h-2v6zm4 0h2V8h-2v12zm4 0h2V4h-2v16z"
        opacity="0.9"
      />
    </svg>
  );
}

export function AssistantChatDock({
  documentUrl,
  compareBaselineText = "",
  compareCurrentText = "",
  compareChunkChanges = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState<DockSize>(() => ({
    w: DEFAULT_WIDTH_PX,
    h: 640,
  }));

  const close = useCallback(() => setOpen(false), []);

  /** Hydrate from localStorage and clamp to current viewport (client-only). */
  useEffect(() => {
    const stored = readStoredSize();
    setSize(clampSize(stored ?? defaultSize()));
  }, []);

  /** If the window shrinks, keep the panel within bounds. */
  useEffect(() => {
    const onResize = () => setSize((s) => clampSize(s));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const resizeRef = useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const endResize = useCallback(() => {
    resizeRef.current = null;
    document.body.style.removeProperty("user-select");
    setSize((s) => {
      const next = clampSize(s);
      persistSize(next);
      return next;
    });
  }, []);

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: size.w,
        startH: size.h,
      };
      document.body.style.userSelect = "none";
    },
    [size.w, size.h],
  );

  const onResizePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const r = resizeRef.current;
    if (!r) return;
    const dx = e.clientX - r.startX;
    const dy = e.clientY - r.startY;
    // Panel anchored bottom-right: moving the top-left grip up-left grows width/height.
    const nextW = clamp(r.startW - dx, MIN_WIDTH_PX, viewportMaxWidth());
    const nextH = clamp(r.startH - dy, MIN_HEIGHT_PX, viewportMaxHeight());
    setSize({ w: nextW, h: nextH });
  }, []);

  const onResizePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (resizeRef.current) endResize();
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [endResize],
  );

  const resetToDefaultSize = useCallback(() => {
    const next = clampSize(defaultSize());
    setSize(next);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-0 right-0 z-[300] flex flex-col items-end gap-3 p-4 sm:bottom-2 sm:right-2">
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close assistant panel"
            className="pointer-events-auto fixed inset-0 z-0 bg-zinc-900/25 backdrop-blur-[1px] sm:hidden"
            onClick={close}
          />
          <section
            id="regulatory-assistant-dock"
            style={{ width: size.w, height: size.h }}
            className="pointer-events-auto relative z-[1] max-w-[calc(100vw-1.25rem)] flex flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-2xl shadow-zinc-900/20 ring-1 ring-zinc-900/5"
            role="dialog"
            aria-label="Regulatory assistant chat"
          >
            {/* Top-left drag resize (panel grows toward top-left; bottom-right stays aligned to stack). */}
            <div
              role="separator"
              aria-orientation="both"
              aria-label="Resize assistant panel"
              title="Drag to resize · double-click to reset size"
              onPointerDown={onResizePointerDown}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={onResizePointerUp}
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                resetToDefaultSize();
              }}
              className="pointer-events-auto absolute left-0 top-0 z-30 flex h-11 w-11 cursor-nwse-resize items-center justify-center rounded-br-xl bg-emerald-950/90 text-white shadow-md ring-1 ring-white/15 hover:bg-emerald-900"
            >
              <ResizeGripIcon />
            </div>

            <header className="flex shrink-0 items-center gap-2.5 border-b border-emerald-900/10 bg-gradient-to-r from-emerald-950 to-zinc-900 pl-12 pr-3 py-3 text-white">
              <ChatBotAvatar size="sm" />
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold tracking-tight">Assistant</h2>
                <p
                  className="line-clamp-2 break-all font-mono text-[11px] leading-snug text-emerald-100/95"
                  title={documentUrl}
                >
                  {documentUrl}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="shrink-0 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
              >
                Close
              </button>
            </header>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2 pt-1">
              <AgentsPanel
                variant="dock"
                documentUrl={documentUrl}
                compareBaselineText={compareBaselineText}
                compareCurrentText={compareCurrentText}
                compareChunkChanges={compareChunkChanges}
              />
            </div>
          </section>
        </>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? "regulatory-assistant-dock" : undefined}
        aria-label={open ? "Close regulatory assistant" : "Open regulatory assistant"}
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-700/30 bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-lg shadow-emerald-900/25 ring-2 ring-white/90 transition hover:from-emerald-500 hover:to-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/50"
        title={open ? "Close assistant" : "Open regulatory assistant"}
      >
        <ChatBotGlyph className="h-7 w-7" />
      </button>
    </div>
  );
}
