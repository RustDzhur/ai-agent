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
| GET | `/api/v1/integrations/openai` | Статус подключения без возврата ключа |
| PUT | `/api/v1/integrations/openai` | Проверить ключ и сохранить зашифрованно (owner/admin) |
| DELETE | `/api/v1/integrations/openai` | Удалить ключ организации (owner/admin) |
| GET | `/api/v1/agents` | Активные версии реестра шаблонов агентов |
| POST | `/api/v1/agents/:slug/install` | Установить шаблон в текущую организацию |
| GET | `/api/v1/my-agents` | Список установленных агентов текущей организации |
| PATCH | `/api/v1/my-agents/:slug` | Приостановить или возобновить установленного агента |
| GET | `/api/v1/agents/assistant/runs` | Последние запросы текущего пользователя в tenant |
| POST | `/api/v1/agents/assistant/run` | Запустить ограниченного текстового ассистента через OpenAI Responses API |

При регистрации принимаются `fullName`, `email`, `password`, `organizationName`; при входе — `email`, `password`. Новый и уже существующий tenant получает первый шаблон помощника как установленного агента; каталог позволяет устанавливать и приостанавливать шаблоны отдельно в каждом tenant. Для OpenAI принимается только `apiKey`; он проверяется на доступ к модели GPT-6 Luna, шифруется AES-256-GCM и никогда не возвращается. `APP_ENCRYPTION_KEY` — отдельный серверный 32-байтовый secret. Ассистент не имеет инструментов и доступа к бизнес-системам; prompt и answer сохраняются в пределах организации.
