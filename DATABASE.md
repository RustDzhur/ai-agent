# Модель данных

Первая миграция `api/migrations/001_workspace_identity.sql` создаёт:

- `users` — учётные записи; email уникален без учёта регистра.
- `organizations` — организации/tenants.
- `organization_memberships` — связь пользователя с tenant и роль `owner`, `admin`, `member` или `viewer`.
- `sessions` — хеш случайного opaque-token, срок действия и активная организация.
- `audit_logs` — события организации, user, request ID и безопасные метаданные.
- `schema_migrations` — версия и checksum применённой миграции.

Организации, членства и audit logs используют PostgreSQL Row-Level Security в режиме `FORCE ROW LEVEL SECURITY`. API устанавливает `app.user_id` и `app.tenant_id` только локально внутри транзакции. Запрос к организации проходит после проверки активного членства. Новые tenant-owned таблицы обязаны иметь `tenant_id`, индексы, RLS policies и интеграционный тест межтенантной изоляции.

`users` и `sessions` являются глобальными identity-таблицами, доступ к которым контролирует auth API. Не передавайте доступ к БД будущим агентам или интеграциям. Миграции запускаются перед стартом API и сверяют checksum уже применённых файлов; изменённую применённую миграцию нужно заменять новой миграцией.
