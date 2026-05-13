
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


curl -X PUT $QDRANT_URL/collections/regulatory_docs/index \
  -H "api-key: $QDRANT_KEY" -H 'Content-Type: application/json' \
  -d '{"field_name":"timestamp","field_schema":"keyword"}'



https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/refs/heads/main/regulation-14-as-of-02-26.pdf


https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/refs/heads/main/regulation-14-as-of-02-26.pdf


https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/refs/heads/main/regulation-14-as-of-02-26.pdf


https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/main/regulation-14-as-of-02-26.pdf



streamlit run regulatory.py



Access the Dashboards:
    n8n: Visit http://localhost:5678 to start building workflows.
    Qdrant Dashboard: Visit http://localhost:6333/dashboard to view your vector collections.

Restart the container for changes to take effect:
    docker-compose down
    docker-compose up -d
