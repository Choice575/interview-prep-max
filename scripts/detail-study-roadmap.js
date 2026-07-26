const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mapPath = path.join(root, 'tasks', 'study_map.json');
const testsPath = path.join(root, 'tasks', 'study_tests.json');

// Each tuple is: title, skill, command/check, observed output, primary risk, safe first action.
const weeks = {
  5: [
    ['Потоки, exit code и строгий режим', 'разделять stdout и stderr, обрабатывать exit code и включать set -Eeuo pipefail', 'bash -n health.sh && ./health.sh >result.log 2>error.log; echo $?', 'syntax=ok; exit=0; stderr=empty', 'скрыть ошибку последней команды успешным echo', 'проверить синтаксис через bash -n и запустить скрипт на тестовых данных'],
    ['Аргументы, env и валидация входа', 'принимать flags и переменные окружения, отклоняя пустые и опасные значения', './health.sh --url http://127.0.0.1:8080 --timeout 2', 'url=127.0.0.1; timeout=2; validation=passed', 'подставить непроверенную строку в shell-команду', 'вывести нормализованные параметры без секретов и завершиться до сетевого вызова'],
    ['Trap, cleanup и временные файлы', 'гарантированно удалять временные файлы через trap при success, error и signal', 'timeout 2 ./collector.sh; test ! -e /tmp/collector.lock', 'signal=TERM; cleanup=done; lock=absent', 'оставить lock-файл после SIGTERM и заблокировать следующий запуск', 'послать SIGTERM тестовому процессу и проверить cleanup без production-данных'],
    ['Cron, flock и идемпотентность', 'защитить cron-задачу от параллельных запусков и повторных побочных эффектов', 'flock -n /tmp/report.lock ./report.sh --dry-run', 'lock=acquired; changes=0; duplicate=skipped', 'запустить две копии и дважды изменить один ресурс', 'выполнить dry-run, затем конкурентный запуск на изолированном lock-файле'],
    ['Health-check и контракт мониторинга', 'собрать health-check с timeout, понятными кодами и кратким диагностическим сообщением', './health-check.sh http://127.0.0.1:8080/health; echo $?', 'status=healthy; latency_ms=42; exit=0', 'возвращать exit 0 при HTTP 500 или timeout', 'проверить healthy, degraded и timeout на локальных заглушках'],
  ],
  6: [
    ['Image, container и слои', 'различать immutable image и writable layer контейнера по inspect и history', 'docker image inspect demo:1.0 && docker history demo:1.0', 'image_id=sha256:a1; layers=6; container_changes=none', 'чинить контейнер вручную и потерять изменения при пересоздании', 'сохранить inspect/history и воспроизвести изменение в Dockerfile'],
    ['Lifecycle, logs и exec', 'читать состояние stopped/running и диагностировать процесс через logs и exec', 'docker ps -a && docker logs --tail 50 demo && docker inspect demo', 'status=exited; exit_code=1; error=missing_config', 'перезапускать контейнер без чтения exit code и логов', 'снять ps, inspect и последние логи до первого restart'],
    ['Сети, DNS и volumes', 'проверять container DNS, published ports и сохранность данных в named volume', 'docker network inspect app-net && docker exec app getent hosts db', 'dns=db:172.20.0.3; port=8080; volume=app-data', 'удалить volume вместе с контейнером при диагностике', 'проверить mount и DNS read-only, не выполняя docker compose down -v'],
    ['Healthcheck, restart policy и limits', 'настроить healthcheck, ограничение памяти и предсказуемую restart policy', 'docker inspect --format "{{json .State.Health}}" demo', 'health=unhealthy; failing_streak=3; oom_killed=false', 'маскировать бесконечный crash loop политикой restart=always', 'временно остановить автоперезапуск на стенде и установить первопричину по health/logs'],
    ['Инцидент: контейнер постоянно падает', 'провести диагностику exited/OOM/config и восстановить сервис пересозданием из версии image', 'docker inspect demo && docker logs --since 10m demo', 'exit_code=137; oom_killed=true; memory=128m', 'увеличить лимит памяти без понимания рабочего набора', 'зафиксировать inspect и метрики, затем откатить на последний стабильный image'],
  ],
  7: [
    ['Build context и cache', 'управлять build context, порядком COPY и воспроизводимым cache', 'docker build --progress=plain -t demo:cache .', 'cached_steps=5; rebuilt_steps=2; context=48kB', 'копировать весь репозиторий до установки зависимостей и сбрасывать cache', 'сравнить plain-логи двух сборок после изменения только исходного файла'],
    ['Multi-stage сборка', 'отделить builder от runtime и исключить toolchain из финального image', 'docker build -t demo:multi . && docker image inspect demo:multi', 'stages=2; runtime_size=42MB; compiler=absent', 'скопировать в runtime весь каталог builder вместе с секретами', 'проверить состав final stage и точечно COPY только runtime-артефакт'],
    ['Non-root и права файлов', 'запускать процесс непривилегированным UID с минимальными правами на каталоги', 'docker run --rm demo:secure id && docker run --rm demo:secure stat -c %a /app', 'uid=10001; gid=10001; app_mode=755', 'оставить USER root ради исправления Permission denied', 'найти требуемый writable path и назначить владельца на этапе build'],
    ['Secrets и .dockerignore', 'не допустить ключи, .git и локальные конфиги в context и слоях image', 'docker history --no-trunc demo:secure && docker run --rm demo:secure find /app -maxdepth 2', 'secret_hits=0; git_dir=absent; env_file=absent', 'передать token через ARG и сохранить его в history слоя', 'проверить context и history, затем использовать BuildKit secret mount'],
    ['Reproducible build и сканирование', 'зафиксировать base digest, сгенерировать SBOM и проверить уязвимости перед publish', 'docker build --pull -t demo:release . && trivy image demo:release', 'digest=sha256:b2; critical=0; sbom=generated', 'публиковать mutable latest без digest и отчёта scan', 'остановить publish при Critical и сохранить digest с отчётом сборки'],
  ],
  8: [
    ['Compose services и DNS', 'описать app и db в Compose и проверить service discovery по имени', 'docker compose up -d && docker compose exec app getent hosts db', 'services=2; db_dns=172.22.0.2; app=running', 'использовать localhost контейнера для доступа к соседнему service', 'проверить compose config и DNS из app до изменения network'],
    ['Environment, secrets и volumes', 'разделить конфигурацию, secret-файлы и persistent volume базы', 'docker compose config && docker compose exec db sh -c "test -s /run/secrets/db_password"', 'secret_file=present; secret_value=redacted; volume=db-data', 'попасть паролем в compose config и git history', 'проверить только наличие secret-файла и права без печати значения'],
    ['Healthcheck и зависимости', 'связать readiness приложения с фактической готовностью базы, а не стартом процесса', 'docker compose ps && docker inspect compose-db-1', 'db_health=healthy; app_health=healthy; retries=0', 'полагаться только на depends_on без health condition', 'снять health logs и отдельно проверить подключение app к db'],
    ['Nginx upstream и TLS', 'настроить reverse proxy, корректные headers и локальный TLS handshake', 'nginx -t && curl -vk https://127.0.0.1/health', 'config=ok; tls=TLSv1.3; upstream_status=200', 'отключить проверку TLS в production вместо исправления chain', 'проверить nginx -t и цепочку сертификата до reload'],
    ['Инцидент 502 в Compose-стенде', 'локализовать 502 между DNS, port, health и Nginx upstream', 'docker compose logs nginx app && curl -sS -o /dev/null -w "%{http_code}" http://app:8080/health', 'proxy=502; app_direct=200; upstream_port_mismatch=true', 'перезапустить весь стек и уничтожить evidence причины', 'сравнить прямой запрос к app с proxy-запросом и откатить последний config'],
  ],
  13: [
    ['Inventory и ad-hoc проверка', 'собрать inventory групп и безопасно проверить connectivity и факты узлов', 'ansible all -i inventory.yml -m ping && ansible all -m setup -a "filter=ansible_distribution"', 'reachable=3; failed=0; distro=Ubuntu', 'начать изменение хостов до проверки inventory и privilege escalation', 'выполнить ping/setup без изменений и ограничить запуск test-группой'],
    ['Playbook и идемпотентность', 'описать желаемое состояние пакета и сервиса и получить changed=0 на повторе', 'ansible-playbook -i inventory.yml site.yml && ansible-playbook -i inventory.yml site.yml', 'first_changed=3; second_changed=0; failed=0', 'использовать shell без creates/changed_when и всегда получать changed', 'запустить playbook на одном тестовом узле и повторить до changed=0'],
    ['Modules, vars и template', 'применить template с валидатором и переменными без ручного sed', 'ansible-playbook site.yml --check --diff --limit test', 'check_changed=1; validation=passed; diff_secret_hits=0', 'вывести secret variable в diff или log', 'использовать no_log для секрета и validate до записи конфигурации'],
    ['Handlers, check mode и diff', 'уведомлять handler только при реальном изменении и оценивать diff до rollout', 'ansible-playbook site.yml --check --diff && ansible-playbook site.yml --limit canary', 'handler_notified=1; canary_failed=0; changed=1', 'перезапускать сервис каждой task независимо от изменения', 'сначала check/diff, затем применить на canary и проверить health'],
    ['Инцидент: массовый changed и failed', 'ограничить blast radius, разобрать recap и восстановить конфигурацию из backup', 'ansible-playbook site.yml --limit failed-host --start-at-task "render config" -vv', 'ok=8; changed=2; failed=1; host=web-03', 'повторить playbook на all и расширить сбой', 'исключить здоровые узлы, сохранить verbose output и исправить один failed-host'],
  ],
  14: [
    ['Структура role и defaults', 'разнести defaults, vars, tasks, handlers и templates с явным публичным интерфейсом role', 'ansible-lint roles/web && ansible-playbook role-test.yml --check', 'lint_failures=0; check_failed=0; role=web', 'спрятать обязательные параметры в vars и сделать их непереопределяемыми', 'проверить defaults и role на одноразовом test inventory'],
    ['Vault и границы секретов', 'шифровать secret vars и не раскрывать их в stdout, diff и artifacts', 'ansible-vault view group_vars/prod/vault.yml --vault-id prod@prompt', 'vault_encrypted=true; decrypted_output=terminal_only; log_secret_hits=0', 'закоммитить vault password file или plaintext backup', 'проверить git diff и права vault-id файла до запуска'],
    ['Rolling update с serial', 'обновлять узлы партиями с health gate и max_fail_percentage', 'ansible-playbook deploy.yml --limit staging -e release=1.4.0', 'serial=1; healthy=3; failed=0; release=1.4.0', 'вывести все backend из балансировщика одновременно', 'начать с одного canary и продолжать только после внешнего health-check'],
    ['delegate_to и run_once', 'управлять drain/add в балансировщике и выполнять миграцию строго один раз', 'ansible-playbook deploy.yml --check --diff -e release=1.4.1', 'migration_runs=1; delegated_checks=3; changed=4', 'выполнить необратимую миграцию на каждом host', 'отделить migration job, проверить backup и поставить run_once с явным владельцем'],
    ['Zero-downtime rollout и rollback', 'провести rolling deploy, обнаружить плохой canary и вернуть предыдущий release', 'ansible-playbook deploy.yml -e release=bad --limit staging', 'canary_health=failed; remaining_hosts=untouched; rollback=1.4.0', 'продолжить rollout после failed health-check', 'остановить play через failed_when и восстановить canary из сохранённой версии'],
  ],
  15: [
    ['Установка и проверка PostgreSQL', 'установить PostgreSQL, проверить cluster status, listener и версию клиента/сервера', 'pg_lsclusters && ss -lntp | grep 5432 && psql -Atc "select version()"', 'cluster=online; listen=127.0.0.1:5432; major=16', 'открыть 5432 наружу до настройки доступа', 'проверить локальный listener и подключение через Unix socket'],
    ['Роли, pg_hba.conf и доступ', 'создать least-privilege роль и объяснить порядок правил pg_hba.conf', 'psql -Atc "select rolname,rolsuper from pg_roles" && pg_isready', 'app_role_super=false; auth=scram-sha-256; accepting=true', 'дать приложению SUPERUSER для обхода ошибки доступа', 'проверить конкретное правило HBA и роль на тестовом подключении'],
    ['SQL, транзакции и блокировки', 'выполнить транзакцию и увидеть active/idle in transaction и lock wait', 'psql -c "select pid,state,wait_event_type from pg_stat_activity"', 'state=active; wait_event_type=Lock; blockers=1', 'завершить backend без определения blocker и владельца транзакции', 'снять pg_stat_activity и pg_locks, затем связаться с владельцем blocker'],
    ['pg_dump и проверка restore', 'создать logical backup, восстановить в отдельную базу и сверить данные', 'pg_dump -Fc app > app.dump && pg_restore --list app.dump | head', 'dump_format=custom; toc_entries=24; exit=0', 'считать успешный pg_dump доказательством восстановимости', 'восстановить dump в disposable database и выполнить контрольные запросы'],
    ['Инцидент: too many clients', 'найти источники соединений, безопасно освободить capacity и настроить pooling', 'psql -c "select application_name,state,count(*) from pg_stat_activity group by 1,2"', 'app=api; idle=92; max_connections=100; rejected=7', 'поднять max_connections без оценки памяти и утечки', 'сохранить распределение sessions и остановить только подтверждённые stale connections'],
  ],
  16: [
    ['WAL, checkpoint и архивирование', 'объяснить путь WAL и проверить archive_command, lag и checkpoint pressure', 'psql -Atc "select archived_count,failed_count from pg_stat_archiver"', 'archived=128; failed=0; wal_bytes=64MB', 'удалить WAL-файлы вручную при заполнении диска', 'проверить archiver и replication slots до любых действий с pg_wal'],
    ['Base backup и backup manifest', 'создать физический backup с manifest и проверить его целостность', 'pg_basebackup -D backup -Ft -z -P && pg_verifybackup backup', 'backup=complete; manifest=valid; checksum_failures=0', 'копировать PGDATA работающего сервера обычным cp', 'использовать pg_basebackup на тестовом replica user и проверить manifest'],
    ['PITR до контрольной точки', 'восстановить base backup и WAL до заданного времени в изолированном окружении', 'pg_ctl -D restore start && psql -Atc "select pg_is_in_recovery()"', 'in_recovery=false; target_row=present; later_row=absent', 'запустить восстановленный кластер на production-порту и каталоге', 'использовать отдельные PGDATA/port и сначала проверить timeline и target'],
    ['Streaming replication и lag', 'настроить replica, измерить byte/time lag и проверить read-only запрос', 'psql -c "select application_name,state,sync_state,write_lag from pg_stat_replication"', 'replica=standby1; state=streaming; lag=120ms', 'оценивать lag только по статусу streaming', 'сравнить LSN primary/replica и выполнить контрольное чтение на replica'],
    ['Failover, RPO и возврат роли', 'провести контролируемый failover и измерить потерю данных и время восстановления', 'pg_ctl promote -D replica && psql -Atc "select pg_is_in_recovery()"', 'promoted=true; rto=75s; lost_transactions=0', 'promote без fencing старого primary и получить split brain', 'изолировать старый primary, зафиксировать LSN и только затем promote replica'],
  ],
  17: [
    ['Pod и декларативный объект', 'создать Pod manifest, читать status/conditions и не редактировать runtime вручную', 'kubectl apply -f pod.yaml && kubectl get pod demo -o wide', 'phase=Running; ready=1/1; restarts=0', 'лечить Pod через kubectl exec вместо изменения manifest', 'сохранить describe/logs и исправить декларативный источник'],
    ['Deployment, ReplicaSet и rollout', 'управлять replicas и image через Deployment с историей rollout', 'kubectl set image deploy/api api=demo:1.1 && kubectl rollout status deploy/api', 'revision=2; updated=3; available=3', 'менять Pod напрямую и потерять правку при reconcile', 'проверить rollout history и обновить Deployment на тестовом namespace'],
    ['Service, ConfigMap и Secret', 'связать Service selector с Pod labels и смонтировать конфигурацию без plaintext в manifest', 'kubectl get svc,endpointslice,configmap,secret -o wide', 'endpoints=3; config=mounted; secret_type=Opaque', 'печатать decoded Secret в общие логи диагностики', 'проверять metadata и mount path без вывода secret value'],
    ['Probes, requests и limits', 'разделить startup/readiness/liveness и задать реалистичные ресурсы', 'kubectl describe pod api && kubectl top pod api', 'ready=true; cpu=80m/250m; memory=140Mi/256Mi', 'использовать liveness для проверки внешней зависимости и создать restart storm', 'сначала настроить readiness и наблюдать метрики до включения liveness'],
    ['Инцидент: CrashLoopBackOff', 'прочитать events, current/previous logs и отличить config error от OOMKilled', 'kubectl describe pod api && kubectl logs api --previous', 'reason=CrashLoopBackOff; last_reason=OOMKilled; exit=137', 'удалять Pod циклически без анализа previous container', 'сохранить describe и previous logs, затем rollback Deployment при регрессии image'],
  ],
  24: [
    ['Архитектура capstone и SLO', 'зафиксировать компоненты, зависимости, SLO, угрозы и критерии приёмки сервиса', 'docker compose config && git diff --check', 'services=4; config_valid=true; slo_availability=99.5', 'начать реализацию без границ системы и rollback-критерия', 'согласовать diagram, SLO и acceptance checklist до deploy'],
    ['Приложение и immutable image', 'собрать versioned non-root image с health endpoint и воспроизводимым digest', 'docker build -t capstone:1.0 . && docker inspect capstone:1.0', 'uid=10001; health=/health; digest=sha256:c4', 'публиковать latest без связи с commit', 'сохранить commit SHA, image digest и scan report как единый release record'],
    ['База, migration и restore', 'выполнить backward-compatible migration, backup и тестовый restore данных', './scripts/backup.sh && ./scripts/restore-check.sh', 'backup=verified; rows=1250; restore_checksum=match', 'выполнять destructive migration без backup и expand/contract', 'проверить restore и применить expand-фазу до переключения приложения'],
    ['Наблюдаемость и runbook', 'добавить метрики, структурные логи, alert и пошаговый runbook', 'curl -s localhost:9090/metrics && ./scripts/test-alert.sh', 'metrics_up=1; alert_fired=true; runbook_link=present', 'создать alert без владельца, threshold и действия', 'проверить synthetic failure и пройти runbook на стенде'],
    ['Deploy, rollback и защита capstone', 'выпустить сервис, смоделировать сбой и доказать восстановление по acceptance checklist', './scripts/deploy.sh 1.0 && ./scripts/game-day.sh', 'deploy=healthy; injected_fault=recovered; rollback_rto=90s', 'показывать только happy path без аварийного сценария', 'зафиксировать baseline, ввести один контролируемый fault и остановиться по guardrail'],
  ],
  25: [
    ['Packet path и маршрутизация', 'проследить пакет через route, interface, gateway и NAT с двух сторон соединения', 'ip route get 10.20.0.15 && tcpdump -ni any host 10.20.0.15', 'via=10.0.0.1; iface=eth0; syn_sent=3; syn_ack=0', 'делать вывод о firewall только по timeout клиента', 'сопоставить route и capture на source/destination до изменения правил'],
    ['nftables и stateful firewall', 'читать counters и conntrack, добавляя минимальное обратимое правило', 'nft list ruleset && conntrack -L | grep 10.20.0.15', 'chain=input; verdict=drop; packets=12; state=new', 'очистить весь ruleset ради одного blocked flow', 'экспортировать ruleset и проверить точный counter нужного chain'],
    ['DNS и TLS chain', 'разделить resolver, TCP reachability, SNI и доверие certificate chain', 'dig +short api.example.test && openssl s_client -connect api.example.test:443 -servername api.example.test', 'dns=10.20.0.15; verify_code=20; issuer=LabCA', 'отключить certificate verification как постоянное исправление', 'сохранить chain и проверить SAN, issuer и время на клиенте'],
    ['VPN, MTU и asymmetric routing', 'диагностировать tunnel routes, MTU/PMTUD и обратный маршрут', 'ip link show wg0 && tracepath 10.30.0.8 && wg show', 'mtu=1420; pmtu=1380; latest_handshake=12s', 'уменьшать MTU наугад на всех интерфейсах', 'измерить path MTU на тестовом flow и проверить counters tunnel'],
    ['Инцидент: межсетевой timeout', 'локализовать timeout по packet path, firewall counter и capture без массовых изменений', 'ss -ntp && nft list ruleset && tcpdump -ni any port 8443', 'client_syn=5; server_capture=0; edge_drop=5', 'одновременно менять route, firewall и application config', 'зафиксировать одну гипотезу, один counter и одно обратимое изменение'],
  ],
  26: [
    ['Алгоритмы балансировки и affinity', 'сравнить round-robin, least-connections и stickiness на измеряемой нагрузке', 'wrk -t2 -c20 -d30s http://lb/ && curl -I http://lb/', 'backend_a=48%; backend_b=52%; p95=84ms; cookie=absent', 'включить sticky sessions для маскировки server-side state', 'измерить распределение без affinity и описать требование состояния'],
    ['Health checks и timeouts', 'настроить connect/server/client timeout и health check с rise/fall', 'echo "show stat" | socat stdio /run/haproxy/admin.sock', 'backend=api2; status=DOWN; check=L7STS; lastchg=14s', 'сделать timeout бесконечным и накопить зависшие соединения', 'снять stats и проверить backend напрямую до исключения из rotation'],
    ['TLS termination и заголовки', 'завершать TLS на edge, передавать корректные forwarding headers и хранить ключ безопасно', 'openssl s_client -connect lb:443 -servername app.test && curl -skI https://lb/', 'verify=0; alpn=h2; x_forwarded_proto=https', 'доверять X-Forwarded-For от любого клиента', 'ограничить trusted proxies и проверить headers на тестовом backend'],
    ['Keepalived и failover VIP', 'настроить VRRP priority, advert и проверяемый переход VIP между узлами', 'ip -br addr && journalctl -u keepalived --since -5m', 'node_a=BACKUP; node_b=MASTER; vip=10.0.0.50; failover=3s', 'допустить два MASTER из-за firewall и получить ARP flapping', 'проверить VRRP traffic и уникальность VIP перед failover test'],
    ['Инцидент: edge деградирует', 'разделить saturation load balancer, unhealthy backend и сетевой отказ', 'curl -s http://localhost:8404/stats && ss -s', 'queue=42; retries=18; backend_down=1; cpu=35%', 'перезапустить оба балансировщика одновременно', 'вывести один unhealthy backend, наблюдая queue и error rate'],
  ],
  27: [
    ['Connections, memory и параметры', 'связать max_connections, work_mem и shared_buffers с реальным профилем sessions', 'psql -c "select state,count(*) from pg_stat_activity group by state"', 'active=18; idle=72; max=100; memory_headroom=1.2GB', 'увеличить work_mem глобально без учёта параллельных операций', 'оценить worst-case memory и изменить параметр сначала на session/staging'],
    ['Indexes и EXPLAIN ANALYZE', 'читать scan type, estimates, buffers и выбирать индекс по workload', 'psql -c "explain (analyze,buffers) select * from orders where customer_id=42"', 'scan=Seq Scan; rows_est=2; rows_actual=1800; buffers_read=4200', 'добавлять индекс на каждый столбец без стоимости записи', 'сохранить baseline plan и проверить candidate index на production-like данных'],
    ['Backup, restore и PITR drill', 'выполнить restore drill с измерением RPO/RTO и контрольной сверкой данных', './run-pitr-drill.sh --target "2026-07-20 10:15:00"', 'restore=passed; rpo=0s; rto=11m; checksum=match', 'считать наличие backup выполненным DR-планом', 'восстановить в изолированный cluster и сверить бизнес-инварианты'],
    ['Replication и наблюдение lag', 'наблюдать slots, WAL retention и replication lag в bytes и seconds', 'psql -c "select slot_name,active,wal_status from pg_replication_slots"', 'slot=standby1; active=false; wal_status=extended; retained=18GB', 'удалить inactive slot без подтверждения владельца replica', 'определить потребителя slot и освободить WAL согласованным способом'],
    ['Failover production-кластера', 'провести fenced failover, переключить клиентов и подготовить rejoin старого primary', './failover.sh --candidate standby1 --dry-run', 'fencing=ready; candidate_lag=0; dns_ttl=30; dry_run=passed', 'promote replica с ненулевым lag без решения о допустимом RPO', 'остановить writes, подтвердить LSN и выполнить fencing до promote'],
  ],
  28: [
    ['Locks и безопасная DDL', 'оценить lock level, lock_timeout и длительность транзакций до migration', 'psql -c "select pid,mode,granted from pg_locks where relation::regclass::text=\'orders\'"', 'mode=AccessShareLock; blockers=1; oldest_xact=12m', 'запустить ALTER TABLE без lock_timeout в пиковое время', 'установить короткий lock_timeout и проверить blocker read-only запросом'],
    ['Expand-contract migration', 'разделить schema change, dual write, backfill и cleanup на совместимые релизы', './migrate.sh expand --dry-run && ./compatibility-test.sh', 'expand=valid; old_app=passed; new_app=passed; destructive_steps=0', 'удалить старый столбец до обновления всех consumers', 'выпустить additive schema и подтвердить совместимость обеих версий'],
    ['Slow query и статистика', 'связать pg_stat_statements, EXPLAIN и актуальность statistics', 'psql -c "select queryid,calls,mean_exec_time from pg_stat_statements order by total_exec_time desc limit 5"', 'queryid=9182; calls=4200; mean_ms=840; plan_misestimation=25x', 'оптимизировать единичный медленный запрос вместо total workload', 'зафиксировать top total time и воспроизвести plan на копии данных'],
    ['VACUUM, bloat и autovacuum', 'оценить dead tuples, freeze age и bloat до tuning autovacuum', 'psql -c "select relname,n_live_tup,n_dead_tup,last_autovacuum from pg_stat_user_tables"', 'table=orders; dead=820000; live=2100000; autovacuum=never', 'запустить VACUUM FULL без окна и заблокировать таблицу', 'запустить обычный VACUUM на стенде и настроить table-level thresholds'],
    ['Инцидент: migration lock', 'найти blocker/blocked chain и безопасно остановить rollout без потери транзакции', 'psql -c "select blocked.pid,blocker.pid from pg_stat_activity blocked join pg_locks on true limit 1"', 'migration_pid=712; blocker_pid=488; blocker_age=27m; queue=36', 'terminate blocker вслепую и потерять пользовательскую транзакцию', 'отменить migration waiter, сохранить chain и согласовать действие с владельцем blocker'],
  ],
  29: [
    ['Control plane и etcd', 'объяснить API server, scheduler, controller manager и проверить health etcd', 'kubectl get --raw=/readyz?verbose && etcdctl endpoint status --write-out=table', 'apiserver=ok; etcd_db=86MB; leader=true; alarms=none', 'считать Ready worker доказательством здоровья control plane', 'проверить readyz и quorum etcd read-only командами'],
    ['Workers, CNI и kube-proxy', 'проследить Pod traffic через CNI, routes и Service implementation', 'kubectl get nodes,pods -A -o wide && ip route', 'nodes_ready=3; cni_ready=true; pod_cidr=10.244.0.0/16', 'менять iptables вручную поверх kube-proxy', 'сохранить CNI logs и сравнить desired Service/endpoints с dataplane'],
    ['PKI, RBAC и kubeconfig', 'проверять срок сертификатов и минимальные RBAC permissions без раскрытия ключей', 'kubeadm certs check-expiration && kubectl auth can-i --list --as system:serviceaccount:demo:api', 'earliest_expiry=179d; wildcard_permissions=none; denied=secrets/list', 'выдать cluster-admin сервисному аккаунту приложения', 'проверить can-i для точного verb/resource и создать namespaced Role'],
    ['План upgrade и skew', 'проверить version skew, drain budget и порядок control plane/workers', 'kubeadm upgrade plan && kubectl get pdb -A', 'current=1.31.4; target=1.32.1; pdb_blocked=0; etcd_backup=ready', 'обновлять все control plane nodes параллельно', 'снять etcd snapshot и обновить один control plane по supported skew'],
    ['Инцидент upgrade control plane', 'остановить неуспешный upgrade, проверить etcd/quorum и вернуть предыдущие пакеты', 'journalctl -u kubelet --since -15m && kubectl get --raw=/readyz?verbose', 'apiserver=failed; etcd=ok; kubelet_version=1.32.1; target_mismatch=true', 'восстанавливать etcd snapshot при здоровом quorum без необходимости', 'заморозить остальные узлы и откатить пакет/manifest только на failed node'],
  ],
  30: [
    ['StorageClass, PV, PVC и CSI', 'проследить provisioning от PVC через StorageClass к CSI и bound PV', 'kubectl get storageclass,pv,pvc -o wide && kubectl describe pvc data-demo-0', 'pvc=Bound; pv=pvc-a1; provisioner=csi.example; zone=ru-a', 'создать Pod до понимания WaitForFirstConsumer и topology', 'проверить events PVC и allowed topologies до изменения scheduler constraints'],
    ['Access modes и reclaim policy', 'объяснить RWO/RWX/ROX, volumeMode и последствия Delete/Retain', 'kubectl get pv -o custom-columns=NAME:.metadata.name,MODE:.spec.accessModes,RECLAIM:.spec.persistentVolumeReclaimPolicy', 'mode=RWO; reclaim=Retain; phase=Bound; volume_mode=Filesystem', 'менять reclaim policy после удаления PVC без проверки PV state', 'сохранить manifest PV/PVC и проверить policy до тестового удаления'],
    ['StatefulSet и стабильная identity', 'проверить ordinal, volumeClaimTemplates и сохранность данных после пересоздания Pod', 'kubectl delete pod db-0 && kubectl exec db-0 -- sha256sum /data/check.txt', 'pod_recreated=true; pvc_same=true; checksum=7ac9', 'считать новый Running Pod доказательством сохранности данных', 'снять PVC/PV UID и checksum до и после controlled reschedule'],
    ['Snapshot, restore и Longhorn', 'создать VolumeSnapshot, восстановить новый PVC и проверить Longhorn replica health', 'kubectl get volumesnapshot && kubectl -n longhorn-system get volumes.longhorn.io', 'snapshot=ready; restored_checksum=match; replicas=3/3', 'называть snapshot полноценным backup без off-cluster копии', 'восстановить snapshot в отдельный PVC и проверить данные до удаления source'],
    ['Storage-инцидент и границы Ceph', 'локализовать attach/mount/topology failure и объяснить, когда Ceph остаётся только обзором', 'kubectl describe pod db-0 && kubectl get volumeattachment', 'pod=Pending; reason=FailedAttachVolume; node_zone=ru-b; pv_zone=ru-a', 'форсировать detach от живого узла и повредить filesystem', 'подтвердить состояние старого node и CSI attachment перед контролируемым detach'],
  ],
  31: [
    ['Signals, SLI и SLO', 'связать latency, traffic, errors, saturation с пользовательским SLI и error budget', 'curl -s localhost:9090/api/v1/query?query=sli_availability', 'availability=99.72%; slo=99.9%; budget_remaining=18%', 'объявить uptime процесса пользовательской доступностью', 'проверить SLI на границе сервиса и согласовать окно SLO'],
    ['Metrics, logs и traces', 'коррелировать три сигнала по service, instance и trace_id без высокой cardinality', 'curl -s localhost:9090/api/v1/query?query=http_requests_total && grep trace_id app.log', 'error_rate=4.2%; trace_id=abc42; failing_span=db', 'помещать user_id в label метрики и взорвать cardinality', 'искать конкретный trace_id в логах и агрегировать метрики по стабильным labels'],
    ['Alerting и runbook', 'создать symptom-based alert с for, severity, owner и проверяемым runbook', './test-alert-rule.sh HighErrorRate', 'rule=valid; pending=5m; fired=true; runbook_check=passed', 'алертить каждую внутреннюю причину без привязки к impact', 'проверить alert на synthetic error и пройти первые шаги runbook'],
    ['Incident command и timeline', 'назначить роли, вести timeline и принимать обратимые решения по evidence', './inject-failure.sh latency && ./collect-incident-timeline.sh', 'declared=10:02; mitigated=10:11; rto=9m; owner=incident-commander', 'разрешить нескольким людям одновременно менять production', 'назначить incident commander и один канал изменений до mitigation'],
    ['Blameless postmortem и actions', 'связать contributing factors с измеримыми action items и владельцами', './validate-postmortem.sh postmortem.md', 'timeline_complete=true; actions_with_owner=4/4; blame_terms=0', 'завершить документ выводом «человеческая ошибка»', 'проверить факты timeline и сформулировать системные controls с due date'],
  ],
  32: [
    ['Архитектура и acceptance финала', 'защитить architecture decision record, SLO, threat model и критерии готовности', './validate-architecture.sh && ./acceptance.sh --dry-run', 'adr_count=5; threats_mitigated=8/8; acceptance_checks=14', 'добавлять компоненты без связи с требованиями', 'заморозить scope и проверить каждое решение через acceptance criterion'],
    ['CI/CD, release и rollback', 'провести signed release от commit до deploy с автоматическим rollback gate', './release.sh --version 2.0.0 --environment staging', 'tests=passed; image_signed=true; deploy=healthy; rollback_ready=true', 'обойти failed gate ради дедлайна и выпустить непроверенный artifact', 'остановить release и сохранить последнюю стабильную версию доступной для rollback'],
    ['Data protection и restore', 'доказать backup, point-in-time restore и бизнес-инварианты после восстановления', './dr-drill.sh --target latest-verified', 'backup_age=4h; restore=passed; rpo=0; rto=14m; invariants=passed', 'показывать backup-файл без фактического restore', 'восстановить данные изолированно и сверить checksums и бизнес-запросы'],
    ['Observability, security и operations', 'проверить dashboard, alerts, SBOM/signature, least privilege и runbooks', './production-readiness.sh', 'slo_checks=passed; alerts=6; critical_vulns=0; runbooks=5; rbac=least_privilege', 'считать зелёный dashboard достаточным без game day', 'ввести ограниченный fault и проверить detection, ownership и recovery'],
    ['Game day и итоговая защита', 'пройти неизвестный incident, измерить recovery и объяснить архитектурные компромиссы', './game-day.sh --scenario random --guardrail staging-only', 'incident=resolved; rto=12m; data_loss=0; rollback=verified; score=86/100', 'скрыть неудачные попытки и не обновить runbook', 'сохранить полный timeline, остановиться по guardrail и оформить lessons learned'],
  ],
};

function buildDay(spec, original) {
  const [title, skill, command, output, risk, safeAction] = spec;
  return {
    ...original,
    title,
    objective: `Научиться ${skill}; решение должно опираться на наблюдаемый результат и предусматривать безопасный возврат.`,
    practice: [
      `Подготовить изолированный стенд и отработать навык: ${skill}.`,
      `Выполнить \`${command}\` и сохранить stdout, stderr, exit code и время проверки.`,
      `Воспроизвести риск «${risk}», не выходя за границы стенда, затем подтвердить причину по evidence.`,
      `Применить шаг «${safeAction}», повторить проверку и записать rollback-критерий.`,
    ],
    pitfalls: [
      risk,
      `Принимать результат «${output}» без сопоставления с состоянием до изменения.`,
      `Менять несколько компонентов в задаче «${title}» одновременно и терять причинно-следственную связь.`,
    ],
    expectedResult: `Практика «${title}» воспроизводится на стенде: сохранён вывод «${output}», известен exit code, описан безопасный первый шаг и проверен rollback без необратимого воздействия.`,
  };
}

function buildQuestions(week, day, spec) {
  const [title, skill, command, output, risk, safeAction] = spec;
  return [
    {
      q: `Как в задаче «${title}» применить навык «${skill}» и какой результат считать достаточным?`,
      expected: `[W${week}D${day}: ${title}] Нужно выполнить проверку \`${command}\`, сохранить исходное и итоговое состояние и получить наблюдаемый результат «${output}». Ответ также фиксирует границы стенда и критерий возврата.`,
      score: 1,
    },
    {
      q: `Дан вывод для «${title}»: ${output}. Что он подтверждает, чего ещё не доказывает и какой дополнительный evidence нужен?`,
      expected: `[W${week}D${day}: ${title}] Вывод подтверждает конкретный контроль, но не доказывает здоровье всех зависимостей. Его нужно сопоставить с exit code, состоянием до изменения и независимой повторной проверкой.`,
      score: 1,
    },
    {
      q: `Какое безопасное действие выполнить первым, если в задаче «${title}» обнаружен риск «${risk}»?`,
      expected: `[W${week}D${day}: ${title}] Сначала следует ${safeAction}. До изменения нужно сохранить исходные evidence и определить stop-condition; после одного обратимого шага повторить ту же проверку и быть готовым к rollback.`,
      score: 1,
    },
    {
      q: `К какому production-сбою приведёт ошибка «${risk}» при работе над «${title}» и как ограничить blast radius?`,
      expected: `[W${week}D${day}: ${title}] Ошибка делает состояние сервиса непредсказуемым и может расширить отказ на зависимые компоненты. Изменение выполняют на стенде или canary, с одним владельцем, измеримым guardrail и подготовленным возвратом.`,
      score: 1,
    },
    {
      q: `Какими evidence и повторными проверками доказать, что практика «${title}» завершена и не создала скрытую регрессию?`,
      expected: `[W${week}D${day}: ${title}] Нужны команда \`${command}\`, результат «${output}», stdout/stderr и exit code, сравнение до/после, негативный сценарий и успешный rollback-тест. Эти данные должны позволять другому инженеру повторить проверку.`,
      score: 1,
    },
  ];
}

const studyMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const studyTests = JSON.parse(fs.readFileSync(testsPath, 'utf8'));

for (const [weekNumberText, specs] of Object.entries(weeks)) {
  const weekNumber = Number(weekNumberText);
  const week = studyMap.weeks.find(item => item.week === weekNumber);
  if (!week || week.days.length !== 5 || specs.length !== 5) throw new Error(`Invalid week ${weekNumber}`);
  week.days = week.days.map((original, index) => buildDay(specs[index], original));
  for (const day of week.days) {
    const miniTest = studyTests.miniTests.find(item => item.id === day.miniTestId);
    if (!miniTest) throw new Error(`Missing mini-test ${day.miniTestId}`);
    miniTest.title = `Мини-тест W${weekNumber}D${day.day}: ${specs[day.day - 1][0]}`;
    miniTest.questions = buildQuestions(weekNumber, day.day, specs[day.day - 1]);
  }
}

fs.writeFileSync(mapPath, JSON.stringify(studyMap, null, 2) + '\n');
fs.writeFileSync(testsPath, JSON.stringify(studyTests, null, 2) + '\n');
console.log(`Detailed ${Object.keys(weeks).length} weeks, ${Object.keys(weeks).length * 5} days and ${Object.keys(weeks).length * 25} questions.`);
