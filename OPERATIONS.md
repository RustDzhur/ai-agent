# Эксплуатация

- Контейнер API автоматически перезапускается; health check проверяет PostgreSQL и Redis.
- Liveness: `/health/live`; readiness: `/health/ready`. Readiness намеренно возвращает 503 при недоступном Redis или PostgreSQL.
- Структурные логи включают request ID и redaction для cookie, authorization и password. У пользователя и активной организации есть безопасный идентификатор в контексте auth-запроса.
- Проверяйте `docker compose ps`, `docker compose logs --since=15m api` и `journalctl -u caddy` без вывода `.env.app`.
- Действующие backups PostgreSQL и серверной конфигурации остаются под управлением отдельного infrastructure repo. Проверка восстановления — отдельная задача до коммерческого запуска.
- Инциденты с учётными данными, tenant isolation или аудитом требуют остановить публичную регистрацию/доступ и сохранить логи до исправления.
