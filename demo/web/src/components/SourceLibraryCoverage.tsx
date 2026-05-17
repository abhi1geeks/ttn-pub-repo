import { useEffect, useMemo, useState } from "react";
import { flattenSourcesCatalog, SOURCES_CATALOG } from "../data/sources_catalog";
import {
  buildIngestManifestText,
  listIngestibleCatalogUrls,
} from "../lib/catalog_ingest_manifest";
import { CUSTOM_SOURCES_CHANGED, loadCustomSources } from "../lib/custom_sources";
import { downloadTextFile } from "../lib/gap_report_export";
import { buildSourceCoverage } from "../lib/source_coverage";
import { sectionTitle } from "../lib/product_labels";

export function SourceLibraryCoverage({ ingestedUrls }: { ingestedUrls: string[] }) {
  const [customRev, setCustomRev] = useState(0);

  useEffect(() => {
    const bump = () => setCustomRev((n) => n + 1);
    window.addEventListener(CUSTOM_SOURCES_CHANGED, bump);
    return () => window.removeEventListener(CUSTOM_SOURCES_CHANGED, bump);
  }, []);

  const customSources = useMemo(() => loadCustomSources(), [customRev]);

  const report = useMemo(
    () => buildSourceCoverage(flattenSourcesCatalog(SOURCES_CATALOG), ingestedUrls, customSources),
    [ingestedUrls, customSources],
  );

  const ingestibleCatalog = useMemo(() => listIngestibleCatalogUrls(), []);

  return (
    <div className="mt-6 rounded-xl border border-emerald-200/80 bg-emerald-50/40 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Ingest coverage — {sectionTitle("1.1")}</p>
      <p className="mt-2 text-sm text-emerald-950">
        <strong className="tabular-nums">{report.ingested}</strong> of{" "}
        <strong className="tabular-nums">{report.total}</strong> catalogue URLs have Qdrant runs (
        <strong className="tabular-nums">{report.percentIngested}%</strong>). Custom team sources:{" "}
        <strong className="tabular-nums">{report.customIngested}</strong>/
        <strong className="tabular-nums">{report.customTotal}</strong> ingested.
      </p>
      <p className="mt-1 text-[11px] text-emerald-800">
        {ingestibleCatalog.length} non-placeholder catalogue URL{ingestibleCatalog.length === 1 ? "" : "s"} ready for
        n8n wiring · production target 475+ sources.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          onClick={() => {
            const safe = new Date().toISOString().replace(/[:.]/g, "-");
            downloadTextFile(
              `gli-ingest-manifest-${safe}.txt`,
              buildIngestManifestText(ingestibleCatalog, customSources),
              "text/plain;charset=utf-8",
            );
          }}
        >
          Download ingest manifest (.txt)
        </button>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {report.regions.map((r) => (
          <li
            key={r.region}
            className="rounded-lg bg-white/80 px-3 py-2 text-xs ring-1 ring-emerald-200/60"
          >
            <span className="font-medium text-zinc-900">{r.region}</span>
            <span className="mt-0.5 block tabular-nums text-zinc-600">
              {r.ingested}/{r.total} ingested
            </span>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-emerald-100">
              <div
                className="h-full rounded-full bg-emerald-600"
                style={{ width: `${r.total > 0 ? Math.round((r.ingested / r.total) * 100) : 0}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
