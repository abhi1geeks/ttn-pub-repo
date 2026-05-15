
create two collection:
1. regulatory_docs
<!-- 2. regulatory_docs_runs -->


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



https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/refs/heads/main/regulation-14-as-of-02-26.pdf


https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/refs/heads/main/regulation-14-as-of-02-26.pdf


https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/refs/heads/main/regulation-14-as-of-02-26.pdf





streamlit run regulatory.py



Access the Dashboards:
    n8n: Visit http://localhost:5678 to start building workflows.
    Qdrant Dashboard: Visit http://localhost:6333/dashboard to view your vector collections.

## Redeploy (Docker Compose)

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
docker ps -a | grep -E 'regulatory-agents|regulatory-web|_qdrant'
docker rm -f <exited-container-id>

docker ps -a --format '{{.ID}} {{.Names}} {{.Status}}' | grep -i web; docker rm -f f9c22a70e3e8 2>/dev/null; docker rm -f regulatory-web 2>/dev/null; cd /home/abhishek-kumar/Documents/RnD/n8n_diff/demo && docker-compose up -d web 2>&1

docker-compose up -d agents web qdrant
```

If your host uses the Compose V2 plugin only, replace `docker-compose` with `docker compose` (same flags).

### `KeyError: 'ContainerConfig'`
 this happens again after an image/config change, use:

docker rm -f <exited-web-container-id> then docker-compose up -d web, or move to docker compose v2 to avoid that bug.

That error almost always means **standalone `docker-compose` v1 (Python)** is **too old** for your **Docker Engine** (common after Docker 25+). The old client expects fields in `docker inspect` that are no longer returned.

**Fix (recommended):** use the **Compose V2 plugin** instead of the legacy binary:

```bash
docker compose version
docker compose up -d --build
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