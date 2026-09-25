# Архитектура Firmspace AI

## Текущий поток запросов

```text
Browser
  ├── /                 → Caddy → frontend/public (немецкий лендинг)
  ├── /app/*            → Caddy → workspace/dist (React workspace)
  └── /api/v1/*         → Caddy → API :3010 → PostgreSQL / Redis
```

API опубликован только на `127.0.0.1:3010`; внешний TLS завершает Caddy. PostgreSQL и Redis доступны контейнеру API только через внутреннюю Docker-сеть `infrastructure`. MinIO уже существует отдельно и будет подключён к приложению на этапе файлового центра.

```text
ai-agent.firmspace.eu
        │ TLS
       Caddy
    ┌───┴──────────────┐
    │                  │
 /app/*             /api/v1/*
    │                  │
 React SPA         Fastify API
                       ├── PostgreSQL (firmspace)
                       └── Redis (rate limiting)
```

## Компоненты

- `frontend/public/` — независимый статический публичный сайт.
- `workspace/` — приложение React/Vite, собираемое в `workspace/dist/` с base path `/app/`.
- `api/` — Fastify API на TypeScript, Argon2id и параметризованные запросы `pg`.
- `api/migrations/` — последовательные миграции с SHA-256 checksum и advisory lock.
- `compose.yaml` — API-контейнер с read-only root filesystem, без Linux capabilities и с health check.
- `deploy/ai-agent.Caddyfile` — отдельный фрагмент сайта/workspace/API; глобальные конфигурации сервисов остаются в инфраструктурном репозитории.

## Границы текущего этапа

Работают только регистрация, вход/выход, сессия, организации, членство, переключение организации, просмотр команды, переименование организации и audit log. Агентский runtime, OAuth, документы, интеграции, workflow, аналитика и billing пока отсутствуют; интерфейс показывает для них статус «в разработке».
