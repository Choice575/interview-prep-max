# Деплой на VPS

Итог: приложение по HTTPS на своём домене, прогресс синхронизируется между
телефоном и ноутбуком, PWA устанавливается на телефон.

Почему нельзя просто по IP: Service Worker регистрируется только в secure
context (HTTPS или localhost). По `http://IP` не будет ни offline-режима, ни
установки на телефон — приложение превратится в обычный сайт.

## 1. Имя вместо домена (DuckDNS, бесплатно)

Домен нужен для сертификата Let's Encrypt. Если своего нет:

1. Откройте https://www.duckdns.org, войдите через GitHub/Google.
2. Создайте поддомен, например `ipmax-mikhail` → получится
   `ipmax-mikhail.duckdns.org`.
3. В поле `current ip` укажите IP вашего VPS, нажмите **update ip**.
4. Проверьте с локальной машины:

```bash
nslookup ipmax-mikhail.duckdns.org
```

Должен вернуться IP сервера. Переезд на собственный домен позже — правка одной
строки `IPMAX_DOMAIN` в `.env`.

## 2. Сервер

Подойдёт минимальный VPS: 1 vCPU, 1 ГБ RAM, Ubuntu 24.04. Приложение без
зависимостей, ресурсов хватает с запасом.

```bash
ssh root@<IP>

# Docker из официального репозитория
curl -fsSL https://get.docker.com | sh

# Отдельный пользователь: контейнеры не должны запускаться от root
adduser --disabled-password --gecos "" ipmax
usermod -aG docker ipmax

# Firewall: наружу только SSH и HTTPS. Порт 4173 закрыт — доступ лишь
# через Caddy, иначе приложение осталось бы доступно в обход TLS.
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

Порт 80 нужен: Let's Encrypt проверяет владение доменом по HTTP, и Caddy на нём
же делает редирект на HTTPS.

## 3. Код и секреты

```bash
su - ipmax
git clone https://github.com/Choice575/interview-prep-max.git
cd interview-prep-max

cp .env.example .env
# Токен синхронизации: минимум 24 символа, иначе процесс упадёт на старте
openssl rand -base64 32
nano .env
```

Заполните в `.env`:

| Переменная | Значение |
|---|---|
`IPMAX_DOMAIN` | `ipmax-mikhail.duckdns.org` |
`IPMAX_ACME_EMAIL` | ваша почта (уведомления Let's Encrypt) |
`IPMAX_SYNC_TOKEN` | вывод `openssl rand -base64 32` |
`IPMAX_ADMIN_TOKEN` | второй вызов `openssl rand -base64 32` |

`IPMAX_ADMIN_TOKEN` открывает раздел «Настройки AI» в интерфейсе: провайдера,
модель и ключ можно задать с телефона, без SSH и перезапуска. Токен должен
отличаться от `IPMAX_SYNC_TOKEN` — иначе одна утечка отдаёт и прогресс, и ключ
провайдера.

AI-переменные можно оставить пустыми: провайдера удобнее настроить из
интерфейса, а без него приложение использует локальный разбор.

Проверьте, что секреты не уедут в git:

```bash
git check-ignore -v .env    # должен показать правило .gitignore
```

## 4. Запуск

```bash
docker compose up -d --build
docker compose ps           # оба контейнера healthy/running
docker compose logs -f caddy
```

В логах Caddy дождитесь строки о полученном сертификате. Первый выпуск занимает
до минуты.

Проверка:

```bash
curl https://ipmax-mikhail.duckdns.org/api/sync/status
# {"enabled":true,"hasSnapshot":false,"revision":0,"maxBytes":1048576}
```

`enabled: true` означает, что токен принят. Если `false` — токен короче 24
символов или не передан.

## 5. Устройства

На ноутбуке и телефоне откройте `https://ipmax-mikhail.duckdns.org`, затем в
настройках приложения вставьте тот же `IPMAX_SYNC_TOKEN` и нажмите
синхронизацию. Токен хранится в `localStorage` устройства и **не уходит на
сервер в составе прогресса**.

На телефоне: меню браузера → «Установить приложение» / «На экран Домой».

## 6. Бэкап

Прогресс лежит в томе `ipmax-data`. Том переживает пересборку образа, но не
удаление вместе с `docker compose down -v`.

```bash
# Резервная копия снимка
docker compose exec app cat /data/snapshot.json > ~/ipmax-backup-$(date +%F).json
```

Автоматически, ежедневно в 3:00:

```bash
crontab -e
0 3 * * * cd /home/ipmax/interview-prep-max && docker compose exec -T app cat /data/snapshot.json > ~/backups/ipmax-$(date +\%F).json 2>/dev/null
```

Сам сервер тоже держит резервную копию предыдущего снимка
(`/data/snapshot.backup.json`) и восстанавливается из неё, если основной файл
окажется битым.

## 7. Обновление

```bash
cd ~/interview-prep-max
git pull
docker compose up -d --build
```

Прогресс не теряется: он на именованном томе, а не в образе. Браузер покажет
баннер обновления, Service Worker подхватит новую версию.

## Диагностика

| Симптом | Причина |
|---|---|
| `enabled: false` в `/api/sync/status` | токен короче 24 символов или не передан в контейнер |
| 401 при синхронизации | токен на устройстве не совпадает с `IPMAX_SYNC_TOKEN` |
| Сертификат не выпускается | DNS-имя не указывает на этот сервер, или закрыт порт 80 |
| PWA не устанавливается | открыли по `http://`, а не `https://` |
| 429 при синхронизации | сработал rate limit, 120 запросов в минуту на устройство |
| «Правка настроек отключена» в разделе AI | не задан `IPMAX_ADMIN_TOKEN` |
| 401 в настройках AI | токен в браузере не совпадает с `IPMAX_ADMIN_TOKEN` |
| «Нужен https://» при сохранении провайдера | адрес по `http` разрешён только для localhost |
| Прогресс исчез после `down -v` | флаг `-v` удаляет тома вместе с данными |

Логи приложения:

```bash
docker compose logs -f app
```
