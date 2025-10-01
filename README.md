# SIT774-10.4HD – Pipeline-Ready Demo App

Minimal Express app prepared for Jenkins CI/CD with Build, Test, Code Quality, Security, Deploy, Release, and Monitoring stages.

## Local run

```bash
npm ci
npm test
docker build -t sit774-10-4hd:dev .
docker compose up -d
curl http://localhost:3000/healthz
```

## Jenkins

- Install NodeJS tool named **NodeJS20**.
- Ensure Docker is available on the agent.
- If using SonarQube, set credentials IDs: `sonar-host-url`, `sonar-token`.
- Create a Pipeline job pointing to this repo with `Jenkinsfile` at repo root.
