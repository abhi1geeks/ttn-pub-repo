
create two collection:
1. regulatory_docs
2. regulatory_docs_runs


export QDRANT_URL=http://localhost:6333 && curl -X PUT $QDRANT_URL/collections/regulatory_docs_runs \
  -H "api-key: $QDRANT_KEY" -H 'Content-Type: application/json' \
  -d '{"vectors":{"size":1,"distance":"Cosine"}}'

curl -X PUT $QDRANT_URL/collections/regulatory_docs_runs/index \
  -H "api-key: $QDRANT_KEY" -H 'Content-Type: application/json' \
  -d '{"field_name":"documentUrl","field_schema":"keyword"}'

curl -X PUT $QDRANT_URL/collections/regulatory_docs_runs/index \
  -H "api-key: $QDRANT_KEY" -H 'Content-Type: application/json' \
  -d '{"field_name":"timestamp","field_schema":"keyword"}'



curl -X PUT http://localhost:6333/collections/regulatory_docs \
     -H 'api-key: YOUR_KEY' -H 'Content-Type: application/json' \
     -d '{"vectors":{"size":1024,"distance":"Cosine"}}'


curl -X PUT http://localhost:6333/collections/regulatory_docs/index \
     -H 'api-key: YOUR_KEY' -H 'Content-Type: application/json' \
     -d '{"field_name":"metadata.documentUrl","field_schema":"keyword"}'

# Optional payload indexes (UC2-003 filters + XC-004 ingest time — create after n8n writes new metadata)
curl -X PUT $QDRANT_URL/collections/regulatory_docs/index \
  -H "api-key: $QDRANT_KEY" -H 'Content-Type: application/json' \
  -d '{"field_name":"metadata.productLine","field_schema":"keyword"}'

curl -X PUT $QDRANT_URL/collections/regulatory_docs/index \
  -H "api-key: $QDRANT_KEY" -H 'Content-Type: application/json' \
  -d '{"field_name":"metadata.jurisdiction","field_schema":"keyword"}'

curl -X PUT $QDRANT_URL/collections/regulatory_docs/index \
  -H "api-key: $QDRANT_KEY" -H 'Content-Type: application/json' \
  -d '{"field_name":"metadata.ingestFetchedAt","field_schema":"keyword"}'


curl -X PUT $QDRANT_URL/collections/regulatory_docs/index \
  -H "api-key: $QDRANT_KEY" -H 'Content-Type: application/json' \
  -d '{"field_name":"timestamp","field_schema":"keyword"}'



https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/main/regulation-14-as-of-02-26.pdf



streamlit run regulatory.py



Access the Dashboards:
    n8n: Visit http://localhost:5678 to start building workflows.
    Qdrant Dashboard: Visit http://localhost:6333/dashboard to view your vector collections.

## Redeploy (docker-compose)

From this **`demo/`** directory (where `docker-compose.yml` lives), after changing **`agents_api`**, **`web`**, or compose env:

**If the stack might already be running:** see what is up, then stop only when you want a clean bounce or hit odd errors:

```bash
cd /path/to/demo
docker-compose ps
# optional: stop and remove this project’s containers + default network
docker-compose down
```

`docker-compose up -d` (without `down`) still **reconciles** the project: it starts missing services and **recreates** a container when its image or relevant compose config changed. It does **not** automatically remove every container first; for a full stop before a rebuild, use **`docker-compose down`** then **`up`** (see “Full stop then start” below).

```bash
cd /path/to/demo
docker-compose build --no-cache agents web
docker-compose up -d
```

Faster loop when only **`agents_api`** changed (CompareAgent / chat pipeline, etc.):

```bash
cd /path/to/demo
docker-compose up -d --build agents
```

Only **`web`** (Node BFF + static UI):

```bash
cd /path/to/demo
docker-compose up -d --build web
```

Recreate containers without rebuilding images (config / env only):

```bash
cd /path/to/demo
docker-compose up -d --force-recreate
```

Full stop then start (same as a clean bounce):

```bash
cd /path/to/demo
docker-compose down
docker-compose up -d
```

If recreate fails again

```bash
docker ps -a | grep -E 'regulatory-agents|demo_web|qdrant'
docker rm -f <exited-container-id>

docker ps -a --format '{{.ID}} {{.Names}} {{.Status}}' | grep -i web; docker rm -f f9c22a70e3e8 2>/dev/null; docker rm -f regulatory-web 2>/dev/null; cd /home/abhishek-kumar/Documents/RnD/n8n_diff/demo && docker-compose up -d web 2>&1

docker-compose up -d agents web qdrant
```

If your host uses the Compose V2 plugin only, replace `docker-compose` with `docker-compose` (same flags).

### `KeyError: 'ContainerConfig'`
 this happens again after an image/config change, use:

docker rm -f <exited-web-container-id> then docker-compose up -d web, or move to docker-compose v2 to avoid that bug.

That error almost always means **standalone `docker-compose` v1 (Python)** is **too old** for your **Docker Engine** (common after Docker 25+). The old client expects fields in `docker inspect` that are no longer returned.

**Fix (recommended):** use the **Compose V2 plugin** instead of the legacy binary:

```bash
docker-compose version
docker-compose up -d --build
```

**Alternative:** upgrade or replace the legacy CLI, e.g. install the **`docker-compose-plugin`** package from Docker’s repo, or upgrade pip install: `pip install -U "docker-compose>=1.29.2"` (then retry `docker-compose up -d`).

Local **without** Docker: restart the **agents** uvicorn process and/or **`npm run dev`** for `web/` after pulling code; n8n workflow JSON is imported manually in the n8n UI.



What you should do locally
Open Grafana: http://localhost:3001 (default is often admin / admin — change it if prompted).

Explore → Loki, try:

{job="docker"} |= `GET /health`
or broader:

{job="docker"} |= `regulatory-agents`
If Promtail fails again on recreate, use the same pattern:


docker ps -a | grep promtail
docker rm -f <exited-promtail-id>
docker-compose -f docker-compose.yml -f docker-compose





<!-- ======= -->

Open the app (Docker)
In your browser go to:

http://localhost:8787/
(or http://127.0.0.1:8787/)

Right now /api/health reports authRequired: false, so you should land on the main app without a login screen. If you later set login in web/.env and recreate the web container, you will see sign-in first.

Quick checks
Home / runs — Page loads; runs list or empty state (depends on Qdrant data).
Agents — Open the Agents / chat area; agentsProxy: true so /api/agents/... should work from the BFF.
Hard refresh — Ctrl+Shift+R (or Cmd+Shift+R) if something looks cached.
If you use npm run dev instead
Your terminal shows npm run dev — that is usually Vite on port 5173 with the API proxied to WEB_PORT (often 9780). Then use:

http://localhost:5173/

Do not mix that up with 8787 unless you intend to; they are two different servers.

Optional sanity URLs
Web health: http://localhost:8787/api/health
Agents (direct): http://localhost:8000/health
I cannot open your browser from here; use the links above on your machine.






===============




Option A — Local dev (recommended for day-to-day)
Run agents and web on the host; Qdrant can stay in Docker.

1. Start Qdrant (if not running)
cd /home/abhishek-kumar/Documents/RnD/n8n_diff/demo
docker-compose up -d qdrant
2. Start agents_api on port 8000
cd /home/abhishek-kumar/Documents/RnD/n8n_diff/demo/agents_api
<!-- python3 -m venv .venv -->
source .venv/bin/activate
pip install -r requirements.txt
AGENTS_STUB_LLM=1 uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
Check:

curl -s http://127.0.0.1:8000/health
You should see something like {"ok":true,"stub_llm":true,...}.

3. Start the web app
In a second terminal:

cd /home/abhishek-kumar/Documents/RnD/n8n_diff/demo/web
npm install   # first time only
npm run dev
Open http://localhost:9780 (from WEB_PORT=9780).

4. Confirm the proxy is on
curl -s http://localhost:9780/api/health
Look for "agentsProxy":true. If it is false, AGENTS_URL is missing or the web server was started before you edited .env — restart npm run dev.

5. Smoke-test through the BFF
curl -s http://localhost:9780/api/agents/health
That should match the agents /health response (proxied via /api/agents/*).

Option B — Everything in docker-compose
cd /home/abhishek-kumar/Documents/RnD/n8n_diff/demo
docker-compose up -d --build agents qdrant web
agents → host http://127.0.0.1:8000
web → host http://localhost:8787
Compose sets AGENTS_URL=http://agents:8000 inside the web container (overrides your host-oriented URL for that service).
Use 8787 for the UI in this mode, not 9780.

How the wiring works
Layer	URL
Browser
POST http://localhost:9780/api/agents/v1/agents/cross-jurisdiction
Node BFF (web/server/index.ts)
Forwards to {AGENTS_URL}/v1/agents/cross-jurisdiction
FastAPI
http://127.0.0.1:8000/v1/agents/cross-jurisdiction
AGENTS_URL must be the root of the agents service (no /v1 suffix, no trailing slash).

Common issues
Symptom	Fix
agentsProxy: false
Set AGENTS_URL=http://127.0.0.1:8000 in web/.env and restart npm run dev
Connection refused on compare/gap
Start uvicorn on 8000, or change AGENTS_URL to match your port
Works in Docker web, not local
Local dev needs 127.0.0.1:8000, not http://agents:8000 (agents is only a Docker DNS name)
Login required
Your .env has WEB_LOGIN_USER / WEB_LOGIN_PASSWORD — sign in at the UI first
Optional: real LLM instead of stub
AGENTS_STUB_LLM=0 AWS_REGION=us-east-1 uvicorn app.main:app --reload --port 8000
With AWS credentials in the environment (never commit them). Default stub (AGENTS_STUB_LLM=1) is enough to exercise 2.3 / 2.4 with structured stub output.

If you want, we can add a one-line docker-compose profile or a small scripts/dev-up.sh so both services start together.



=======

demo/scripts/dev-up.sh
Starts agents_api with uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 (default) in the background.
Then runs web with npm run dev in the foreground (same terminal as today).
Ctrl+C (or exit) runs a trap that stops the uvicorn process.
AGENTS_STUB_LLM defaults to 1; override when you run the script, e.g. AGENTS_STUB_LLM=0 ./scripts/dev-up.sh.
UVICORN_PORT: default 8000; if you change it, set AGENTS_URL in web/.env to the same host/port.
SKIP_AGENTS=1: only starts the web app (no Python service).
If agents_api/.venv exists, it is activated; otherwise it falls back to python3 on PATH and prints a warning.
The script is executable (chmod +x).


<!-- cd /home/abhishek-kumar/Documents/RnD/n8n_diff/demo
./scripts/dev-up.sh -->

cd /home/abhishek-kumar/Documents/RnD/n8n_diff/demo
AGENTS_STUB_LLM=0 AWS_REGION=us-east-1 ./scripts/dev-up.sh


==========
docker-compose build web && docker-compose rm -sf web && docker rm -f regulatory-web 2>/dev/null; docker-compose up -d web



=====

For ingest / agents only (fast):

docker-compose build agents
docker-compose up -d agents n8n
Full stack including web (slower first time, cached after):


./scripts/compose-up.sh --build-all


=== Remove the bad file (optional)

docker exec n8n rm -f /data/regulatory/pdfs/aefc061c77d64b2e/2026-05-17T06:14:46.868Z.pdf