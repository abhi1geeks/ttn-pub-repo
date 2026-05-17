/** Turns logged-in username from `/api/auth/me` into a short display fragment for UI greetings.
 * Demo sessions store plain username only — avoid treating like email/local-part splitting unless extended later.
 */
export function welcomeUsernameDisplay(username: string | null | undefined): string | null {
  const t = typeof username === "string" ? username.trim() : "";
  if (!t) return null;
  if (t.includes("@")) {
    const local = t.split("@")[0]?.trim() ?? "";
    if (!local) return null;
    return formatCapitalizedWords(local.replace(/\./g, " "));
  }
  return formatCapitalizedWords(t.replace(/[._-]+/g, " "));
}

function formatCapitalizedWords(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
