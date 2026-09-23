FROM node:22-alpine

RUN apk add --no-cache python3 curl shadow \
  && addgroup -S anketa \
  && adduser -S -D -H -G anketa anketa \
  && mkdir -p /etc/anketa /var/log/anketa /opt/anketa \
  && printf 'PORT=8080\n' > /etc/anketa/config.ini \
  && printf 'polygon-demo-api-key\n' > /etc/anketa/api.key \
  && chown root:root /etc/anketa /etc/anketa/config.ini /etc/anketa/api.key \
  && chmod 700 /etc/anketa \
  && chmod 600 /etc/anketa/config.ini /etc/anketa/api.key

COPY app.py /opt/anketa/app.py
COPY wrapper.sh /opt/anketa/wrapper.sh
COPY lab-server.js /opt/anketa/lab-server.js
RUN chmod 755 /opt/anketa/app.py /opt/anketa/wrapper.sh \
  && chown -R root:root /opt/anketa /var/log/anketa

WORKDIR /root
EXPOSE 4181 4182
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:4181/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "/opt/anketa/lab-server.js"]
