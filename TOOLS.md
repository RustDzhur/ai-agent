# Инструменты и выполнение агентов

На первом этапе AI runtime и tool gateway не реализованы. Backend предоставляет только учётные записи, организации, роли и журнал аудита. Агентам не выдаются DB credentials, Redis ACL, MinIO credentials или host filesystem access.

Будущий tool gateway должен выдавать allowlisted tools по tenant, role, agent permissions и policy. Каждому tool execution нужны `run_id`, `tool_run_id`, timeout, idempotency key, audit event и проверка approval. Внешние источники считаются untrusted input. Не хранить и не отображать внутреннюю chain-of-thought модель.
