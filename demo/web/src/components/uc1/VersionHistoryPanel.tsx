import { fmtTs } from "../../lib/format";
import { downloadTextFile } from "../../lib/gap_report_export";
import { buildVersionHistoryCsv, type VersionHistoryRun } from "../../lib/version_history_export";
import { featureDisplayName } from "../../lib/product_labels";
import { parseHitlReview } from "../../lib/uc1";

export type { VersionHistoryRun };

function hitlLabel(run: VersionHistoryRun): string | null {
  const p = parseHitlReview(run.hitlReview);
  if (!p) return null;
  return p.status === "flagged" ? "Flagged" : "Acknowledged";
}

export function VersionHistoryPanel({
  documentUrl,
  runs,
  currentIdx,
  baselineIdx,
  onSelectCurrent,
  onSelectBaseline,
}: {
  documentUrl: string;
  runs: VersionHistoryRun[];
  currentIdx: number;
  baselineIdx: number;
  onSelectCurrent: (idx: number) => void;
  onSelectBaseline: (idx: number) => void;
}) {
  if (runs.length === 0) return null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm ring-1 ring-zinc-100">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{featureDisplayName("1.4")}</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">
        Every ingest snapshot for this canonical URL, newest first. Use <strong>Current</strong> / <strong>Baseline</strong> to
        drive the redline and embedding delta tabs. Export the selected pair via the audit JSON button above.
      </p>
      {runs.length ? (
        <button
          type="button"
          className="mt-3 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          onClick={() => {
            const csv = buildVersionHistoryCsv(documentUrl, runs);
            const safe = new Date().toISOString().replace(/[:.]/g, "-");
            downloadTextFile(`gli-version-history-${safe}.csv`, csv, "text/csv;charset=utf-8");
          }}
        >
          Export version history (.csv)
        </button>
      ) : null}
      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
            <tr>
              <th className="px-3 py-2">Ingest time</th>
              <th className="px-3 py-2">Version id</th>
              <th className="px-3 py-2">Doc hash</th>
              <th className="px-3 py-2">Δ chunks</th>
              <th className="px-3 py-2">HITL</th>
              <th className="px-3 py-2">Role</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run, idx) => {
              const s = run.summary ?? {};
              const isCurrent = idx === currentIdx;
              const isBaseline = idx === baselineIdx;
              const hitl = hitlLabel(run);
              const hash = run.documentHash?.trim();
              return (
                <tr
                  key={run.runPointId ?? run.versionId ?? run.timestamp ?? idx}
                  className={`border-t border-zinc-100 ${isCurrent ? "bg-emerald-50/50" : isBaseline ? "bg-amber-50/40" : ""}`}
                >
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-800">{fmtTs(String(run.timestamp ?? ""))}</td>
                  <td className="max-w-[140px] truncate px-3 py-2 font-mono text-[11px] text-zinc-600" title={run.versionId}>
                    {run.versionId ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-zinc-600" title={hash}>
                    {hash ? `${hash.slice(0, 12)}…` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-zinc-800">
                    <span className="text-emerald-700">+{s.newChunks ?? 0}</span>
                    <span className="text-zinc-400"> / </span>
                    <span className="text-red-700">−{s.removedChunks ?? 0}</span>
                    <span className="text-zinc-400"> · </span>
                    <span>{s.totalChunks ?? "—"}</span>
                  </td>
                  <td className="px-3 py-2">
                    {hitl ? (
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          hitl === "Flagged" ? "bg-red-100 text-red-900" : "bg-emerald-100 text-emerald-900"
                        }`}
                      >
                        {hitl}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => onSelectCurrent(idx)}
                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          isCurrent
                            ? "bg-emerald-600 text-white"
                            : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"
                        }`}
                      >
                        Current
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectBaseline(idx)}
                        disabled={runs.length < 2}
                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium disabled:opacity-40 ${
                          isBaseline
                            ? "bg-amber-600 text-white"
                            : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"
                        }`}
                      >
                        Baseline
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
