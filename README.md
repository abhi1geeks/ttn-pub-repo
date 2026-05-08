How to Start the Services

Install Docker: Ensure you have Docker Desktop or Docker Engine installed.
Run the Command: Open your terminal in the directory where you saved the file and run:
    docker-compose up -d
Access the Dashboards:
    n8n: Visit http://localhost:5678 to start building workflows.
    Qdrant Dashboard: Visit http://localhost:6333/dashboard to view your vector collections.

Connecting n8n to QdrantTo make them talk to each other within n8n:
    Host: Use qdrant (the service name in the Docker file) instead of localhost if you are connecting them via the internal Docker network.
    
    Port: Use 6333.API Key: By default, the local setup doesn't require an API key unless you manually add one to the Qdrant environment variables.

Restart the container for changes to take effect:
    docker-compose down
    docker-compose up -d



https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/e5f478ac7bd82405b0b1a8ed0862e8316ddc68eb/regulation-14-as-of-02-26.pdf

https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/main/regulation-14-as-of-02-26.pdf
https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/main/web-site-report-batavia-downs-casino.pdf



curl -X PUT http://localhost:6333/collections/regulatory_docs \
     -H 'api-key: YOUR_KEY' -H 'Content-Type: application/json' \
     -d '{"vectors":{"size":1024,"distance":"Cosine"}}'


curl -X PUT http://localhost:6333/collections/regulatory_docs/index \
     -H 'api-key: YOUR_KEY' -H 'Content-Type: application/json' \
     -d '{"field_name":"metadata.documentUrl","field_schema":"keyword"}'


Change-log collection (optional, for "what changed?" chat)

This workflow can store a short per-run change summary in a second Qdrant collection.
Create it once (same vector size as your embedding model, default 1024):

curl -X PUT http://localhost:6333/collections/regulatory_change_log \
     -H 'Content-Type: application/json' \
     -d '{"vectors":{"size":1024,"distance":"Cosine"}}'



git checkout main
git reset --hard checkpoint/demo-ready