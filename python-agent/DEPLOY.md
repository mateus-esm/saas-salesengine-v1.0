# Solo Copilot Agent Deploy

Deploy this service as a Dokploy application rooted at `python-agent`.

## Dokploy

1. Create a Dokploy application linked to this repository.
2. Set the build/root path to `python-agent`.
3. Enable Git auto-deploy for `main`.
4. Add a domain such as `agent.<domain>` and route HTTPS traffic to container
   port `8000`.
5. Add every variable from `.env.example` in Dokploy's Environment tab.
6. Keep `INGEST_ENABLED=false` for the first deploy.

Secrets must live only in Dokploy environment variables. Do not bake `.env`
files or API keys into the image.

## First Smoke Test

After the first deploy, confirm the service boots and answers:

```bash
curl https://agent.<domain>/api/v1/health
```

Expected response:

```json
{"status":"ok"}
```

## Autonomous Ingest

Only enable the background loop after the Sync path is accepted.

1. In Supabase, enable `pg_cron` and `pg_net`.
2. Apply the cron migration after replacing the agent domain and
   `AGENT_INTERNAL_TOKEN`.
3. Set `INGEST_ENABLED=true` in Dokploy.
4. Enable `equipes.is_crm_agent_enabled` only for the pilot team.

