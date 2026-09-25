# Workflows

Workflow engine пока не включён. Workspace не создаёт шаблонные или фиктивные workflow и не показывает успешное исполнение.

Запланированная модель: tenant-owned Workflow → WorkflowNode/WorkflowEdge → WorkflowRun → Task/TaskEvent → Approval. До включения конструктора нужны schema validation, ограниченный execution worker, durable queue, retry/backoff, dead-letter handling, идемпотентность, pause/stop и человеческое подтверждение рискованных действий.
