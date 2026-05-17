import type { ReactNode } from "react";
import { Uc1Hero } from "../uc1/Uc1Panels";
import type { AppSurface } from "../../lib/workspace_persist";

const navPill =
  "rounded-lg px-4 py-2 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50";

export function AppShell({
  surface,
  onSurfaceChange,
  sessionUser,
  onLogout,
  showWorkspaceNav = false,
  children,
}: {
  surface: AppSurface;
  onSurfaceChange: (s: AppSurface) => void;
  sessionUser?: string | null;
  onLogout?: () => void;
  /** Hub / Ingest tabs — only when the user has access to the workspace. */
  showWorkspaceNav?: boolean;
  children: ReactNode;
}) {
  const rightSlot =
    sessionUser ? (
      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-center text-[11px] font-mono text-emerald-100/95">
          {sessionUser}
        </span>
        {onLogout ? (
          <button
            type="button"
            onClick={() => void onLogout()}
            className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
          >
            Sign out
          </button>
        ) : null}
      </div>
    ) : undefined;

  const bottomNav = (
    <nav aria-label="Main workspace" className="mx-auto flex max-w-[1600px] flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onSurfaceChange("gli_hub")}
        className={`${navPill} ${
          surface === "gli_hub" ? "bg-emerald-400 text-emerald-950 shadow-sm" : "bg-white/10 text-white hover:bg-white/15"
        }`}
      >
        GLI Intelligence hub
      </button>
      <button
        type="button"
        onClick={() => onSurfaceChange("ingest_workspace")}
        className={`${navPill} ${
          surface === "ingest_workspace"
            ? "bg-emerald-400 text-emerald-950 shadow-sm"
            : "bg-white/10 text-white hover:bg-white/15"
        }`}
      >
        Ingest monitor
      </button>
    </nav>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-100 to-zinc-200/80">
      <Uc1Hero rightSlot={rightSlot} bottomNav={showWorkspaceNav ? bottomNav : undefined} />
      {children}
    </div>
  );
}
