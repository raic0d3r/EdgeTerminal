EdgeTerminal Docker deployment files

Files to add at the ROOT of https://github.com/raic0d3r/edgeterminal (main branch):
- Dockerfile
- compose.yaml
- .dockerignore
- Replace next.config.ts with the included version (adds output: "standalone")

Portainer deployment settings after committing these files:
- Stack name: edgeterminal
- Build method: Repository
- Repository URL: https://github.com/raic0d3r/edgeterminal
- Repository reference: refs/heads/main
- Compose path: compose.yaml
- Authentication: OFF (repository is public)
- GitOps polling: leave OFF for the first deployment; enable after successful verification.

Important:
- The app binds on the server at 127.0.0.1:3001 only. It does NOT take over public ports 80 or 443.
- Existing Nginx sites are not changed by these files.
- Persistent app data is stored in Docker volume edgeterminal_data, mounted at /app/data.
- MARKET_DATA_MODE and ECONOMIC_DATA_MODE default to demo. Do not set live until provider credentials, access rights, and data have been verified.
- Add any required credentials in Portainer's stack environment variables. Never commit .env files or secrets to GitHub.
- FIREBASE_SERVICE_ACCOUNT_KEY should be provided as the exact JSON string expected by the app, if that integration is needed.

The Dockerfile builds on Node 24 (matching package.json) and compiles better-sqlite3 for the target ARM64 host.
