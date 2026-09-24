# Приложение без сборки и без runtime-зависимостей: node_modules нужны только
# для тестов и линтера, поэтому в образ не попадают вовсе.
FROM node:22-alpine

# tini как PID 1: без него Node не получает SIGTERM от docker stop и контейнер
# убивается по таймауту через SIGKILL, обрывая запись снимка на середине.
RUN apk add --no-cache tini

WORKDIR /app

# Каталог данных создаём заранее и передаём пользователю node: смонтированный
# том иначе принадлежит root, и процесс не сможет записать снимок.
RUN mkdir -p /data && chown -R node:node /data

COPY --chown=node:node package.json ./
# Всё, что видит браузер, лежит в public/ (аудит A4.1): новый модуль попадает
# в образ без правки этого файла. Сервер берёт из public/ и общие модули
# (синк, AI), поэтому отдельного списка файлов здесь нет.
COPY --chown=node:node public/ ./public/
COPY --chown=node:node server.js ./
COPY --chown=node:node server/ ./server/

USER node

ENV NODE_ENV=production \
    IPMAX_HOST=0.0.0.0 \
    IPMAX_PORT=4173 \
    IPMAX_SYNC_DIR=/data

EXPOSE 4173

# Проверяем публичный статус-эндпоинт: он не требует токена и подтверждает,
# что процесс реально обслуживает запросы, а не просто занял порт.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.IPMAX_PORT||4173)+'/api/sync/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
