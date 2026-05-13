/** Format version / timestamp strings like Streamlit `fmt_ts`. */
export function fmtTs(ts: string): string {
  if (!ts) return "unknown";
  try {
    const normalized = ts.replace("Z", "+00:00");
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return ts;
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const da = String(d.getUTCDate()).padStart(2, "0");
    const h = String(d.getUTCHours()).padStart(2, "0");
    const mi = String(d.getUTCMinutes()).padStart(2, "0");
    return `${y}-${mo}-${da} ${h}:${mi} UTC`;
  } catch {
    return ts;
  }
}
