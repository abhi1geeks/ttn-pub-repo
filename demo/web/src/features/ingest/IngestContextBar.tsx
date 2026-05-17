import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import type { SourceHealthSummary } from "../../lib/source_health";
import { fmtTs } from "../../lib/format";
import type { HitlStatus } from "../../components/uc1/Uc1Panels";

export function IngestContextBar({
  documentUrl,
  runCount,
  currentRunTimestamp,
  hitlStatus,
  sourceHealth,
  onOpenHub,
}: {
  documentUrl: string;
  runCount: number;
  currentRunTimestamp?: string;
  hitlStatus: HitlStatus;
  sourceHealth: SourceHealthSummary;
  onOpenHub: () => void;
}) {
  const healthTone =
    sourceHealth.status === "ok" ? "success" : sourceHealth.status === "error" ? "danger" : "warning";

  const hitlLabel =
    hitlStatus === "acknowledged"
      ? "Acknowledged"
      : hitlStatus === "flagged"
        ? "Flagged"
        : "Not reviewed";

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Ingest workspace</p>
          <p className="mt-1 truncate text-sm font-medium text-zinc-900" title={documentUrl}>
            {documentUrl.length > 88 ? `${documentUrl.slice(0, 88)}…` : documentUrl}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            <Badge tone="accent">{runCount} run{runCount === 1 ? "" : "s"}</Badge>
            {currentRunTimestamp ? <span>Current: {fmtTs(currentRunTimestamp)}</span> : null}
            <Badge tone={hitlStatus === "flagged" ? "danger" : hitlStatus === "acknowledged" ? "success" : "neutral"}>
              HITL · {hitlLabel}
            </Badge>
            <Badge tone={healthTone}>{sourceHealth.label}</Badge>
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">{sourceHealth.detail}</p>
        </div>
        <Button variant="ghost" className="shrink-0 text-xs" onClick={onOpenHub}>
          Back to hub
        </Button>
      </div>
    </Card>
  );
}
