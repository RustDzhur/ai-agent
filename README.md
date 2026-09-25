# AI Agent Firmspace

Исходный код публичного немецкоязычного сайта `ai-agent.firmspace.eu`. Сейчас это статическая концептуальная страница; личный кабинет и система AI-агентов будут разрабатываться отдельными этапами.

## Структура

```text
.
├── frontend/public/       # HTML, CSS, JavaScript, favicon и robots.txt
└── deploy/
    └── ai-agent.Caddyfile # Блок виртуального хоста для Caddy
```

## Развёртывание

Скопируйте `frontend/public/` в веб-каталог на сервере. Блок из `deploy/ai-agent.Caddyfile` добавьте в основной `/etc/caddy/Caddyfile`, затем проверьте и перезагрузите конфигурацию Caddy. DNS для `ai-agent.firmspace.eu` должен указывать на сервер.

На текущем сервере Caddy отдаёт сайт из `/opt/projects/firmspace/frontend/public`. Серверные конфигурации PostgreSQL, Redis, MinIO и остальных доменов в этот репозиторий не входят.
