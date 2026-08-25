FROM python:3.12-alpine

RUN apk add --no-cache curl shadow \
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
RUN chmod 755 /opt/anketa/app.py /opt/anketa/wrapper.sh \
  && chown -R root:root /opt/anketa /var/log/anketa

WORKDIR /root
CMD ["/opt/anketa/wrapper.sh"]
