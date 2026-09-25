# Интеграции

Подключения Gmail, Microsoft 365, CRM, accounting, ERP, banking, MCP и других провайдеров ещё не реализованы. Их карточки на публичной странице — концепция и не являются рабочими integrations; workspace пока показывает их как недоступные.

При реализации нужны OAuth state/PKCE, минимальные scopes, tenant-bound connection records, зашифрованные credentials, отзыв токенов, health status и audit logs. Секреты интеграций нельзя возвращать браузеру или передавать непосредственно агентам.
