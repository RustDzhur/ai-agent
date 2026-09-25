# AI Agent Firmspace

Публичный сайт Firmspace AI и отдельное приложение `/app` для защищённого рабочего пространства. Лендинг и workspace полностью на немецком языке. Реализация идёт этапами; недоступные модули прямо помечаются и не показывают фиктивные данные.

В workspace работают учётная запись и организация, а также первый текстовый OpenAI-ассистент без бизнес-инструментов. Для реального запуска владелец организации добавляет собственный OpenAI project key в настройках; ключ шифруется на сервере.

## Структура

```text
.
├── frontend/public/       # HTML, CSS, JavaScript, favicon и robots.txt
├── workspace/             # React-приложение личного кабинета
├── api/                   # Fastify API и миграции PostgreSQL
├── compose.yaml           # Контейнер API, подключённый к приватной сети данных
├── IMPLEMENTATION_PLAN.md # Аудит и этапы реализации по ТЗ
└── deploy/
    └── ai-agent.Caddyfile # Блоки сайта, /app и /api для Caddy
```

## Развёртывание

Требуется Node.js 24+. Сборка: `npm ci`, затем `npm run build`. API запускается в контейнере через `compose.yaml` и использует PostgreSQL и Redis по внутренней сети Docker `infrastructure`. Для deployment нужен серверный файл `.env.app`; он не должен попадать в Git.

В текущем Caddy-фрагменте публичная часть `/` остаётся на существующем deployment `/opt/projects/firmspace/frontend/public`, workspace `/app` отдаётся из `/opt/projects/ai-agent/workspace/dist`, а `/api/*` проксируется к API на loopback-порт 3010. Глобальные конфигурации PostgreSQL, Redis, MinIO и прочих доменов остаются в отдельном инфраструктурном репозитории.

Подробное описание уже выполненных и следующих этапов: `IMPLEMENTATION_PLAN.md`.
