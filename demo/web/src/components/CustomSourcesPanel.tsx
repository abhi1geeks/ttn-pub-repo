import { useCallback, useMemo, useState } from "react";
import {
  loadCustomSources,
  newCustomSourceId,
  saveCustomSources,
  type CustomSourceEntry,
} from "../lib/custom_sources";
import { sectionTitle } from "../lib/product_labels";

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-500/15";

export function CustomSourcesPanel() {
  const [rows, setRows] = useState<CustomSourceEntry[]>(() => loadCustomSources());
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const persist = useCallback((next: CustomSourceEntry[]) => {
    saveCustomSources(next);
    setRows(next);
  }, []);

  const addRow = useCallback(() => {
    setError(null);
    const u = url.trim();
    if (!u.startsWith("https://")) {
      setError("documentUrl must start with https://");
      return;
    }
    if (!region.trim() || !country.trim() || !jurisdiction.trim() || !body.trim()) {
      setError("Fill region, country, jurisdiction, and regulatory body.");
      return;
    }
    const entry: CustomSourceEntry = {
      id: newCustomSourceId(),
      region: region.trim(),
      country: country.trim(),
      jurisdiction: jurisdiction.trim(),
      regulatoryBody: body.trim(),
      documentUrl: u,
    };
    persist([...rows, entry]);
    setRegion("");
    setCountry("");
    setJurisdiction("");
    setBody("");
    setUrl("");
  }, [region, country, jurisdiction, body, url, rows, persist]);

  const remove = useCallback(
    (id: string) => {
      persist(rows.filter((r) => r.id !== id));
    },
    [rows, persist],
  );

  const countLabel = useMemo(() => `${rows.length} custom source${rows.length === 1 ? "" : "s"}`, [rows.length]);

  return (
    <section className="rounded-2xl border border-amber-200/80 bg-white p-6 shadow-sm ring-1 ring-amber-100">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">{sectionTitle("1.1")} — team additions</p>
      <h3 className="mt-1 text-lg font-semibold text-zinc-900">Add canonical URLs (browser only)</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">
        Demo: entries are stored in <code className="rounded bg-zinc-100 px-1 text-xs">localStorage</code> and merged into
        the ingest monitor URL list. Run n8n against the same URL to attach Qdrant runs.
      </p>
      <p className="mt-1 text-xs text-zinc-500">{countLabel}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-zinc-700">
          Region
          <input className={`${inputClass} mt-1`} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. EMEA" />
        </label>
        <label className="block text-xs font-medium text-zinc-700">
          Country
          <input className={`${inputClass} mt-1`} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Spain" />
        </label>
        <label className="block text-xs font-medium text-zinc-700">
          Jurisdiction
          <input
            className={`${inputClass} mt-1`}
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            placeholder="e.g. DGOJ"
          />
        </label>
        <label className="block text-xs font-medium text-zinc-700">
          Regulatory body / title
          <input
            className={`${inputClass} mt-1`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="e.g. Technical circular — logging"
          />
        </label>
        <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
          Canonical document URL (https)
          <input
            className={`${inputClass} mt-1 font-mono text-xs`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
      </div>
      {error ? <p className="mt-2 text-sm text-red-800">{error}</p> : null}
      <button
        type="button"
        onClick={addRow}
        className="mt-3 rounded-xl bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
      >
        Add to library
      </button>

      {rows.length ? (
        <ul className="mt-5 space-y-2 border-t border-zinc-100 pt-4">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 text-sm sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium text-zinc-900">{r.regulatoryBody}</p>
                <p className="text-xs text-zinc-600">
                  {r.region} · {r.country} · {r.jurisdiction}
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-emerald-900">{r.documentUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => remove(r.id)}
                className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
