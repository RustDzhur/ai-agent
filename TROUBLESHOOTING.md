# Диагностика

## Workspace не открывается

Проверьте, что `workspace/dist/index.html` существует и Caddy matcher обслуживает `/app` и `/app/*`. Для прямого обновления внутреннего URL SPA fallback должен возвращать `index.html`.

## API отвечает 502 или readiness 503

Проверьте `docker compose ps`, API logs, доступность `postgres:5432` и Redis по Docker-сети `infrastructure`. API намеренно не обходится без Redis rate limiter. Не ослабляйте readiness, чтобы скрыть неисправность.

## Вход возвращает ошибку

Убедитесь, что браузер обращается к тому же hostname, для которого установлены HTTPS cookie и `APP_ORIGINS`. Полностью обновите `/app/`, затем проверьте cookies `__Host-fs_session` и `__Host-fs_csrf`; значения cookie не копируйте в тикеты и логи.

## Organization access denied

Активная организация должна быть в списке членств текущей сессии. Проверьте membership и RLS в рамках DB integration test; не выдавайте приложению роль superuser и не отключайте `FORCE ROW LEVEL SECURITY`.
