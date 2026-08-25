#!/bin/sh
set -eu
while true; do
  : > /var/log/anketa/anketa.log
  if su -s /bin/sh -c 'python /opt/anketa/app.py' anketa; then
    exit 0
  fi
  printf '%s Permission denied\n' "$(date -Iseconds)" >> /var/log/anketa/anketa.log
  sleep 2
done
