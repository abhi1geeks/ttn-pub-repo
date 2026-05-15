import { type FormEvent, useState } from "react";

export function LoginGate({ onLoggedIn }: { onLoggedIn: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      let data: Record<string, unknown> = {};
      try {
        data = (await r.json()) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
      if (!r.ok) {
        setErr(typeof data.message === "string" ? data.message : `Sign-in failed (${r.status}).`);
        return;
      }
      const u = typeof data.user === "string" ? data.user : username.trim();
      onLoggedIn(u);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col px-6 py-16">
      <div className="rounded-2xl border border-zinc-200/90 bg-white p-8 shadow-lg ring-1 ring-zinc-100">
        <h2 className="text-lg font-semibold text-zinc-900">Sign in</h2>
        <p className="mt-1 text-sm text-zinc-600">
          This deployment requires a password. Ask your administrator for access.
        </p>
        <form className="mt-6 space-y-4" onSubmit={(e) => void submit(e)}>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500" htmlFor="lg-user">
              Username
            </label>
            <input
              id="lg-user"
              name="username"
              autoComplete="username"
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none ring-zinc-100 focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/20"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500" htmlFor="lg-pass">
              Password
            </label>
            <input
              id="lg-pass"
              name="password"
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none ring-zinc-100 focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/20"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </div>
          {err ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-sm text-rose-950">{err}</div>
          ) : null}
          <button
            type="submit"
            disabled={busy || !username.trim() || !password}
            className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-900/15 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Signing in…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
