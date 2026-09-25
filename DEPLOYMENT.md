# Развёртывание

## Переносимая установка

Основной `compose.yaml` запускает сайт (`/`), workspace (`/app`), API, PostgreSQL и Redis в одной Docker Compose-сети. Приложение не использует абсолютные пути с текущего сервера, общую сеть `infrastructure` или внешнюю базу данных.

На новом Linux-сервере установите Docker Engine и Compose plugin, клонируйте репозиторий, скопируйте `.env.example` в `.env` и замените все секреты. Сгенерируйте случайные значения:

```sh
openssl rand -hex 32   # POSTGRES_PASSWORD
openssl rand -hex 32   # REDIS_PASSWORD
openssl rand -base64 32 # APP_ENCRYPTION_KEY
```

Задайте `APP_ORIGINS` списком точных origin-адресов сайта, например `https://ai-agent.firmspace.eu,https://www.ai-agent.firmspace.eu`, и `COOKIE_SECURE=true` за HTTPS reverse proxy. Не включайте завершающий слеш в origin. Затем выполните:

```sh
docker compose up --build -d
docker compose ps
```

Веб-контейнер по умолчанию доступен только на loopback `127.0.0.1:8080`. Настройте reverse proxy/TLS перед ним или измените `HTTP_BIND`, ограничив доступ firewall. Прокси должен передавать правильные `Host` и `X-Forwarded-Proto: https`. `/api/*` маршрутизируется во внутренний API; публичный сайт обслуживается по `/`, кабинет — по `/app/`.

Миграции PostgreSQL автоматически применяются при старте API. `postgres_data` содержит постоянную базу; сохраняйте её вместе с `APP_ENCRYPTION_KEY`. Потеря или замена ключа шифрования сделает сохранённые ключи AI-провайдера нечитаемыми. `.env` содержит production-секреты и не должен коммититься.

Обновление: `git pull` и `docker compose up --build -d`. Резервное копирование и восстановление базы описаны в `OPERATIONS.md`.

## Существующий сервер Firmspace

`compose.server.yaml` сохраняет текущий формат API-сервиса: использует серверный `.env.app`, внешнюю Docker-сеть `infrastructure` и публикует API только на `127.0.0.1:3010`. Его не нужно использовать для самостоятельной установки. Публичный сайт и workspace на текущем сервере продолжают маршрутизироваться через Caddy-файл `deploy/ai-agent.Caddyfile`; параметры общей инфраструктуры находятся отдельно от этого репозитория.
