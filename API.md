# API v1

Все изменяющие запросы должны иметь допустимый `Origin`, CSRF cookie и заголовок `X-CSRF-Token`. Workspace передаёт сессионную cookie автоматически. Ошибки содержат стабильный code и request ID; внутренние stack traces клиенту не возвращаются.

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/health/live` | Liveness процесса |
| GET | `/health/ready` | Проверка PostgreSQL и Redis |
| GET | `/api/v1/auth/session` | CSRF token, текущий пользователь, доступные организации |
| POST | `/api/v1/auth/register` | Создать пользователя, организацию, owner-членство и сессию |
| POST | `/api/v1/auth/login` | Вход по email и паролю |
| POST | `/api/v1/auth/logout` | Отозвать текущую сессию |
| POST | `/api/v1/organizations` | Создать отдельную организацию текущего пользователя |
| POST | `/api/v1/organizations/select` | Переключить tenant после проверки членства |
| GET | `/api/v1/organizations/current` | Текущая организация и роль |
| PATCH | `/api/v1/organizations/current` | Переименовать организацию (owner/admin) |
| GET | `/api/v1/organizations/current/members` | Список членов текущего tenant |
| GET | `/api/v1/organizations/current/audit` | Последние 50 событий текущей организации |

При регистрации принимаются `fullName`, `email`, `password`, `organizationName`; при входе — `email`, `password`. Новые endpoint'ы tenant data должны использовать общий tenant context и проверку роли. OpenAPI, pagination, webhooks и API keys добавляются на соответствующих следующих этапах.
