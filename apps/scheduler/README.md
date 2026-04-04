# `apps/scheduler`

Thin process that publishes scheduled sync messages to RabbitMQ (same job shapes as manual sync from `apps/api`).

Run on a cron schedule in Kubernetes; exit 0 after enqueue batch completes.
