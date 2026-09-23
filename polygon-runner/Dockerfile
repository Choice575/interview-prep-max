FROM node:22-alpine

RUN apk add --no-cache tini
WORKDIR /runner
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY polygon-runner/service.js polygon-runner/lab-adapter.js polygon-runner/gateway.js polygon-runner/server.js ./

ENV NODE_ENV=production POLYGON_HOST=0.0.0.0 POLYGON_PORT=4180 POLYGON_MAX_SESSIONS=1 POLYGON_TTL_MS=1200000
EXPOSE 4180
HEALTHCHECK --interval=10s --timeout=5s --start-period=25s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.POLYGON_PORT||4180)+'/api/polygon/tasks').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
