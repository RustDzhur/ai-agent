# Развёртывание

## Предварительные требования

- Node.js 24 для сборки frontend.
- Docker Engine/Compose на Linux-сервере.
- Внутренняя Docker-сеть `infrastructure`, PostgreSQL с базой `firmspace` и ролью приложения, Redis ACL-пользователь `firmspace`.
- Caddy с уже действующими сертификатами для `ai-agent.firmspace.eu` и `www.ai-agent.firmspace.eu`.

## Переменные сервера

В ignored-файле `/opt/projects/ai-agent/.env.app` должны находиться `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `APP_ENCRYPTION_KEY`, `APP_ORIGINS`, `SESSION_TTL_HOURS` и `COOKIE_SECURE`. Файл имеет права `0600`; не выводите его содержимое и не добавляйте в Git. `APP_ENCRYPTION_KEY` — base64 от 32 случайных байт; создаётся один раз командой `openssl rand -base64 32` и резервируется отдельно от базы. Потеря ключа лишит приложение доступа к сохранённым provider credentials. Production origins: `https://ai-agent.firmspace.eu,https://www.ai-agent.firmspace.eu`; `COOKIE_SECURE=true`.

## Сборка

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

На сервере API-контейнер собирается из `api/Dockerfile`, миграции запускаются перед API startup, порт публикуется только на `127.0.0.1:3010`. В Caddy-фрагменте `/app/*` должен указывать на собранный `workspace/dist`, `/api/*` — на loopback API, `/` — на существующий публичный сайт. Для текстового ассистента пользователь добавляет собственный OpenAI project key в настройках организации; ключи OpenAI не входят в server `.env.app`.

Перед применением схемы и Caddy изменения нужно создать backup PostgreSQL и текущего Caddyfile. После запуска проверьте `/health/ready`, login/register journey и Caddy-конфигурацию. Возврат к предыдущей версии выполняется переключением deployment checkout и возвратом сохранённой копии Caddyfile; применённые миграции не редактируются напрямую.
