import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  GLI_FEATURES,
  GLI_LIBRARY_CAPACITY_NOTE,
  groupFeaturesByModule,
  type GliFeatureRow,
} from "../data/gli_features";
import { ENFORCEMENT_FEED, type EnforcementAction } from "../data/enforcement_feed";
import { HORIZON_FEED, type HorizonItem } from "../data/horizon_feed";
import { SOURCES_CATALOG, countCatalogLeaves, type SourceRegion } from "../data/sources_catalog";
import { buildEnforcementTimeline } from "../lib/enforcement_timeline";
import { buildEnforcementTrendSummary, type EnforcementTrendSummary } from "../lib/enforcement_trends";
import { buildHorizonAlertPreview } from "../lib/horizon_alert_preview";
import { buildEnforcementFeedCsv, buildHorizonFeedCsv } from "../lib/feed_export";
import { downloadTextFile } from "../lib/gap_report_export";
import { horizonAlertHeadline, horizonEarlyWarnings } from "../lib/horizon_alerts";
import {
  INGEST_FEATURE_IDS,
  type IngestFeatureFocusId,
} from "../lib/ingest_feature_focus";
import { CustomSourcesPanel } from "./CustomSourcesPanel";
import { EnforcementTimeline } from "./EnforcementTimeline";
import { EnforcementTrendBars } from "./EnforcementTrendBars";
import { GliResearchTools } from "./GliResearchTools";
import { SourceLibraryCoverage } from "./SourceLibraryCoverage";
import {
  HORIZON_WATCHLIST_CHANGED,
  isHorizonWatched,
  loadHorizonWatchlist,
  toggleHorizonWatch,
} from "../lib/horizon_watchlist";
import { sectionTitle } from "../lib/product_labels";

const FEATURE_SECTION_ID: Record<string, string> = {
  "1.1": "gli-section-library",
  "1.5": "gli-section-horizon",
  "2.3": "gli-section-research",
  "2.4": "gli-section-research",
  "2.5": "gli-section-enforcement",
};

const btnBase =
  "rounded-lg px-3 py-2 text-left text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/40";

export function GliIntelligenceHub({
  knownDocumentUrls,
  onOpenInIngestMonitor,
  onNavigateToIngestFeature,
  agentsAvailable,
}: {
  knownDocumentUrls: string[];
  onOpenInIngestMonitor: (documentUrl: string) => void;
  onNavigateToIngestFeature: (featureId: IngestFeatureFocusId) => void;
  agentsAvailable: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string>(GLI_FEATURES[0]!.id);
  const known = useMemo(() => new Set(knownDocumentUrls), [knownDocumentUrls]);
  const byModule = useMemo(() => {
    const m = groupFeaturesByModule(GLI_FEATURES);
    return [...m.entries()];
  }, []);
  const selected = useMemo(
    () => GLI_FEATURES.find((f) => f.id === selectedId) ?? GLI_FEATURES[0]!,
    [selectedId],
  );
  const leafCount = useMemo(() => countCatalogLeaves(SOURCES_CATALOG), []);
  const enforcementTrend = useMemo(() => buildEnforcementTrendSummary(ENFORCEMENT_FEED), []);
  const enforcementTimeline = useMemo(() => buildEnforcementTimeline(ENFORCEMENT_FEED), []);
  const horizonWarnings = useMemo(() => horizonEarlyWarnings(HORIZON_FEED), []);

  const libraryRef = useRef<HTMLDivElement>(null);
  const horizonRef = useRef<HTMLElement>(null);
  const enforcementRef = useRef<HTMLElement>(null);
  const researchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sectionId = FEATURE_SECTION_ID[selectedId];
    if (!sectionId) return;
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId]);

  const selectedIsIngestFeature = INGEST_FEATURE_IDS.has(selectedId);

  return (
    <div className="mx-auto max-w-[1600px] px-6 pb-20 pt-8">
      <header className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm ring-1 ring-zinc-100">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">GLI AI Intelligence</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">Product capabilities</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600">
          Browse capabilities by module. Operational features open in{" "}
          <strong>Ingest monitor</strong> for diffs, reviewer checkpoints, and RegGPT on ingested URLs.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,280px)_1fr]">
        <nav
          aria-label="GLI features by module"
          className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:sticky lg:top-6 lg:self-start"
        >
          {byModule.map(([module, rows]) => (
            <div key={module}>
              <h3 className="border-b border-zinc-100 pb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                {module}
              </h3>
              <ul className="mt-2 space-y-1">
                {rows.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className={`${btnBase} w-full ${
                        r.id === selectedId
                          ? "bg-emerald-50 font-medium text-emerald-950 ring-1 ring-emerald-200"
                          : "text-zinc-700 hover:bg-zinc-50"
                      }`}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <span className="block leading-snug">{r.featureName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="space-y-8">
          <FeatureDetailCard
            row={selected}
            showIngestCta={selectedIsIngestFeature}
            onOpenIngestMonitor={() => onNavigateToIngestFeature(selectedId as IngestFeatureFocusId)}
          />

          <section
            id="gli-section-library"
            ref={libraryRef}
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm ring-1 ring-zinc-100"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{sectionTitle("1.1")}</p>
                <h3 className="mt-1 text-lg font-semibold text-zinc-900">Source library</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{GLI_LIBRARY_CAPACITY_NOTE}</p>
              </div>
              <div className="shrink-0 rounded-xl bg-zinc-900 px-4 py-3 text-center text-white">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Catalogued sources</p>
                <p className="text-2xl font-semibold tabular-nums">{leafCount}</p>
                <p className="text-[11px] text-zinc-400">live targets in tree</p>
              </div>
            </div>

            <SourceLibraryCoverage ingestedUrls={knownDocumentUrls} />

            <div className="mt-6 space-y-3">
              {SOURCES_CATALOG.map((region) => (
                <RegionTree
                  key={region.id}
                  region={region}
                  known={known}
                  onOpenInIngestMonitor={onOpenInIngestMonitor}
                />
              ))}
            </div>

            <div className="mt-8">
              <CustomSourcesPanel />
            </div>
          </section>
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <HorizonFeedPanel
          sectionRef={horizonRef}
          earlyWarnings={horizonWarnings}
          onOpenInIngestMonitor={onOpenInIngestMonitor}
        />
        <EnforcementFeedPanel
          sectionRef={enforcementRef}
          trend={enforcementTrend}
          timeline={enforcementTimeline}
          onOpenInIngestMonitor={onOpenInIngestMonitor}
        />
      </div>

      <div id="gli-section-research" ref={researchRef}>
        <GliResearchTools agentsAvailable={agentsAvailable} ingestedDocumentUrls={knownDocumentUrls} />
      </div>
    </div>
  );
}

function FeedMonitorButton({
  monitorDocumentUrl,
  onOpenInIngestMonitor,
}: {
  monitorDocumentUrl?: string;
  onOpenInIngestMonitor: (documentUrl: string) => void;
}) {
  if (!monitorDocumentUrl) return null;
  return (
    <button
      type="button"
      onClick={() => onOpenInIngestMonitor(monitorDocumentUrl)}
      className="mt-2 rounded-lg bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-zinc-800"
    >
      Open in ingest monitor
    </button>
  );
}

function HorizonFeedPanel({
  sectionRef,
  earlyWarnings,
  onOpenInIngestMonitor,
}: {
  sectionRef: RefObject<HTMLElement>;
  earlyWarnings: HorizonItem[];
  onOpenInIngestMonitor: (documentUrl: string) => void;
}) {
  const [watchlist, setWatchlist] = useState<string[]>(() => loadHorizonWatchlist());
  const [alertPreview, setAlertPreview] = useState<string | null>(null);

  useEffect(() => {
    const onChange = () => setWatchlist(loadHorizonWatchlist());
    window.addEventListener(HORIZON_WATCHLIST_CHANGED, onChange);
    return () => window.removeEventListener(HORIZON_WATCHLIST_CHANGED, onChange);
  }, []);

  const watchedItems = useMemo(
    () => HORIZON_FEED.filter((h) => isHorizonWatched(h.id, watchlist)),
    [watchlist],
  );

  const toggleWatch = useCallback((id: string) => {
    setWatchlist(toggleHorizonWatch(id));
  }, []);

  return (
    <section
      id="gli-section-horizon"
      ref={sectionRef}
      className="rounded-2xl border border-violet-200/80 bg-white p-6 shadow-sm ring-1 ring-violet-100"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-800">{sectionTitle("1.5")}</p>
      <h3 className="mt-1 text-lg font-semibold text-zinc-900">Upcoming instruments (illustrative)</h3>
      <p className="mt-2 text-xs leading-relaxed text-zinc-600">
        Synthetic demo backlog — replace with live bill / consultation feeds when scrapers are approved.
      </p>
      <button
        type="button"
        className="mt-3 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
        onClick={() => {
          const safe = new Date().toISOString().replace(/[:.]/g, "-");
          downloadTextFile(`gli-horizon-feed-${safe}.csv`, buildHorizonFeedCsv(HORIZON_FEED), "text/csv;charset=utf-8");
        }}
      >
        Export horizon feed (.csv)
      </button>
      {watchedItems.length > 0 ? (
        <div className="mt-4 rounded-xl border border-violet-400/60 bg-violet-100/50 px-4 py-3 text-sm text-violet-950">
          <p className="font-semibold text-violet-900">Your early-warning watchlist (demo)</p>
          <p className="mt-1 text-xs leading-relaxed">
            {watchedItems.length} instrument{watchedItems.length === 1 ? "" : "s"} — demo alerts would email the
            assigned routing queue before enactment.
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {watchedItems.map((h) => (
              <li key={h.id}>
                <span className="font-medium">{h.jurisdiction}</span> — {h.instrument}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-violet-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-900"
              onClick={() => setAlertPreview(buildHorizonAlertPreview(watchedItems))}
            >
              Preview alert digest
            </button>
            {alertPreview ? (
              <button
                type="button"
                className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-900 hover:bg-violet-50"
                onClick={() => {
                  void navigator.clipboard?.writeText(alertPreview);
                }}
              >
                Copy preview
              </button>
            ) : null}
          </div>
          {alertPreview ? (
            <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-white/90 p-3 text-[11px] leading-relaxed text-zinc-800 ring-1 ring-violet-200">
              {alertPreview}
            </pre>
          ) : null}
        </div>
      ) : null}
      <div className="mt-4 rounded-xl border border-violet-300/80 bg-violet-50/70 px-4 py-3 text-sm text-violet-950">
        <p className="font-semibold text-violet-900">Early-warning band (demo)</p>
        <p className="mt-1 text-xs leading-relaxed">{horizonAlertHeadline(earlyWarnings.length)}</p>
        <ul className="mt-2 space-y-1 text-xs">
          {earlyWarnings.map((h) => (
            <li key={h.id}>
              <span className="font-medium">{h.jurisdiction}</span> — {h.instrument}{" "}
              <span className="text-violet-800">({h.stage})</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
            <tr>
              <th className="px-3 py-2">Jurisdiction</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Instrument</th>
              <th className="px-3 py-2">Summary</th>
              <th className="px-3 py-2">Next milestone</th>
              <th className="px-3 py-2">Watch</th>
              <th className="px-3 py-2">Monitor</th>
            </tr>
          </thead>
          <tbody>
            {HORIZON_FEED.map((h: HorizonItem, rowIdx) => (
              <tr key={h.id} className={`border-t border-zinc-100 ${rowIdx % 2 === 1 ? "bg-zinc-50/60" : ""}`}>
                <td className="px-3 py-2 font-medium text-zinc-900">{h.jurisdiction}</td>
                <td className="px-3 py-2">
                  <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-900">
                    {h.stage}
                  </span>
                </td>
                <td className="max-w-[220px] px-3 py-2 text-zinc-800">
                  <span className="line-clamp-2 font-medium">{h.instrument}</span>
                  <a
                    href={h.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block text-[11px] font-medium text-emerald-800 underline"
                  >
                    {h.sourceLabel} link
                  </a>
                </td>
                <td className="max-w-[200px] px-3 py-2 text-xs leading-snug text-zinc-700">{h.summary}</td>
                <td className="px-3 py-2 text-xs text-zinc-600">{h.nextMilestone}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleWatch(h.id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                      isHorizonWatched(h.id, watchlist)
                        ? "bg-violet-700 text-white hover:bg-violet-800"
                        : "border border-violet-300 bg-white text-violet-900 hover:bg-violet-50"
                    }`}
                  >
                    {isHorizonWatched(h.id, watchlist) ? "Watching" : "Watch"}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <FeedMonitorButton
                    monitorDocumentUrl={h.monitorDocumentUrl}
                    onOpenInIngestMonitor={onOpenInIngestMonitor}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EnforcementFeedPanel({
  sectionRef,
  trend,
  timeline,
  onOpenInIngestMonitor,
}: {
  sectionRef: RefObject<HTMLElement>;
  trend: EnforcementTrendSummary;
  timeline: ReturnType<typeof buildEnforcementTimeline>;
  onOpenInIngestMonitor: (documentUrl: string) => void;
}) {
  return (
    <section
      id="gli-section-enforcement"
      ref={sectionRef}
      className="rounded-2xl border border-rose-200/80 bg-white p-6 shadow-sm ring-1 ring-rose-100"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-800">{sectionTitle("2.5")}</p>
      <h3 className="mt-1 text-lg font-semibold text-zinc-900">Global actions (illustrative)</h3>
      <p className="mt-2 text-xs leading-relaxed text-zinc-600">
        Synthetic trend notes for stakeholder demos — not sourced from a live enforcement API.
      </p>
      <button
        type="button"
        className="mt-3 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
        onClick={() => {
          const safe = new Date().toISOString().replace(/[:.]/g, "-");
          downloadTextFile(
            `gli-enforcement-feed-${safe}.csv`,
            buildEnforcementFeedCsv(ENFORCEMENT_FEED),
            "text/csv;charset=utf-8",
          );
        }}
      >
        Export enforcement feed (.csv)
      </button>
      <div className="mt-4 rounded-xl border border-rose-200/90 bg-rose-50/60 px-4 py-3 text-sm text-rose-950">
        <p className="font-semibold text-rose-900">Trend analysis (demo)</p>
        <p className="mt-1 text-xs leading-relaxed">{trend.narrative}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-rose-200">
            Rising: {trend.up}
          </span>
          <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-rose-200">
            Stable: {trend.stable}
          </span>
          <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-rose-200">
            New category: {trend.newCategory}
          </span>
        </div>
        {trend.hotspots.length ? (
          <p className="mt-2 text-xs">
            <span className="font-medium">Hotspots:</span> {trend.hotspots.join(", ")}
          </p>
        ) : null}
        <EnforcementTrendBars trend={trend} />
        <EnforcementTimeline buckets={timeline} />
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Jurisdiction</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Summary</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Trend (demo)</th>
              <th className="px-3 py-2">Monitor</th>
            </tr>
          </thead>
          <tbody>
            {ENFORCEMENT_FEED.map((e: EnforcementAction, rowIdx) => (
              <tr key={e.id} className={`border-t border-zinc-100 ${rowIdx % 2 === 1 ? "bg-zinc-50/60" : ""}`}>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-700">{e.actionDate}</td>
                <td className="px-3 py-2 font-medium text-zinc-900">{e.jurisdiction}</td>
                <td className="px-3 py-2 text-xs text-zinc-700">{e.actionType}</td>
                <td className="max-w-[200px] px-3 py-2 text-xs leading-snug text-zinc-700">{e.summary}</td>
                <td className="px-3 py-2 text-xs text-zinc-800">{e.amountLabel}</td>
                <td className="px-3 py-2 text-xs text-zinc-600">{e.trendNote}</td>
                <td className="px-3 py-2">
                  <FeedMonitorButton
                    monitorDocumentUrl={e.monitorDocumentUrl}
                    onOpenInIngestMonitor={onOpenInIngestMonitor}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FeatureDetailCard({
  row,
  showIngestCta,
  onOpenIngestMonitor,
}: {
  row: GliFeatureRow;
  showIngestCta?: boolean;
  onOpenIngestMonitor?: () => void;
}) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm ring-1 ring-zinc-100">
      <p className="text-xs font-medium text-zinc-500">{row.module}</p>
      <h3 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900">{row.featureName}</h3>

      <dl className="mt-6 space-y-5">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">How it works</dt>
          <dd className="mt-1.5 text-sm leading-relaxed text-zinc-800">{row.description}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Why GLI needs this</dt>
          <dd className="mt-1.5 text-sm leading-relaxed text-zinc-800">{row.whyGliNeedsIt}</dd>
        </div>
      </dl>
      {showIngestCta && onOpenIngestMonitor ? (
        <button
          type="button"
          onClick={onOpenIngestMonitor}
          className="mt-6 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-500"
        >
          Open in ingest monitor
        </button>
      ) : null}
    </article>
  );
}

function RegionTree({
  region,
  known,
  onOpenInIngestMonitor,
}: {
  region: SourceRegion;
  known: Set<string>;
  onOpenInIngestMonitor: (documentUrl: string) => void;
}) {
  return (
    <details className="group rounded-xl border border-zinc-200 bg-zinc-50/50 open:bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          <span>{region.name}</span>
          <span className="text-[11px] font-normal text-zinc-500">{region.countries.length} countries</span>
        </span>
      </summary>
      <div className="space-y-2 border-t border-zinc-100 px-3 pb-3 pt-1">
        {region.countries.map((country) => (
          <div key={`${region.id}-${country.name}`} className="rounded-lg bg-white p-3 ring-1 ring-zinc-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{country.name}</p>
            <ul className="mt-2 space-y-2">
              {country.jurisdictions.map((jur) => (
                <li key={`${country.name}-${jur.name}`} className="text-sm">
                  <p className="font-medium text-zinc-800">{jur.name}</p>
                  <ul className="mt-1.5 space-y-2 border-l-2 border-emerald-200/80 pl-3">
                    {jur.sources.map((src) => {
                      const hasRuns = known.has(src.documentUrl);
                      return (
                        <li key={src.id} className="text-sm text-zinc-700">
                          <p className="font-medium text-zinc-900">{src.regulatoryBody}</p>
                          <a
                            href={src.documentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 block break-all text-xs text-emerald-800 underline decoration-emerald-300/70"
                          >
                            {src.documentUrl}
                          </a>
                          {src.notes ? <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{src.notes}</p> : null}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                hasRuns ? "bg-emerald-100 text-emerald-900" : "bg-amber-50 text-amber-900"
                              }`}
                            >
                              {hasRuns ? "Ingested" : "Not ingested yet"}
                            </span>
                            {src.gameTypes?.length ? (
                              <span className="text-[10px] text-zinc-500">Tags: {src.gameTypes.join(", ")}</span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => onOpenInIngestMonitor(src.documentUrl)}
                              className="rounded-lg bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-zinc-800"
                            >
                              Open in ingest monitor
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
