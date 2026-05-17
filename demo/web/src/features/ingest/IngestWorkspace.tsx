import type { ReactNode } from "react";

/** Layout shell for the ingest monitor surface (content composed in App until further split). */
export function IngestWorkspace({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-[1600px] px-6 pb-24 pt-8">{children}</main>;
}
