# Деплой

Как код попадает на живой сайт и что для этого нужно настроить.

**Статус:** автоматика написана, но не подключена — нет аккаунтов, сервера
и секретов. Пока их нет, workflow'ы деплоя завершаются успешно, ничего не
делая. Шаги ниже выполняет человек, Claude их сделать не может.

---

## Как это работает

```
  работаем в dev  ──PR──►  main  ──автоматически──►  живой сайт
                                   │
                                   ├─► frontend/ → Cloudflare Pages
                                   └─► backend/  → VPS (Hetzner)
```

Деплой запускается **только при попадании в `main`**, то есть после
мерджа Pull Request. Пуш в `dev` ничего не выкатывает — в этом весь смысл
разделения веток.

Запустить деплой руками можно во вкладке **Actions** на GitHub →
нужный workflow → **Run workflow**.

## Почему фронт и бэк в разных местах

Cloudflare Pages отдаёт статику из CDN: бесплатно, быстро по всему миру и
с защитой от DDoS — для украинского сайта это не теория, атаки случаются
регулярно. Бэку нужен живой Node-процесс, для этого CDN не подходит.

Побочный плюс: если бэк ляжет, сайт продолжит открываться. Не будет
работать только отправка формы. Если бы всё стояло на одном сервере,
падение уносило бы сайт целиком.

---

## Шаг 1. Cloudflare Pages (фронт)

1. Завести аккаунт на [cloudflare.com](https://cloudflare.com) — бесплатный.
2. В разделе **Workers & Pages** создать проект Pages с именем
   **`building-site`**. Имя должно совпадать с тем, что указано в
   `.github/workflows/deploy-frontend.yml` — иначе деплой не найдёт проект.
   Создавать через «Direct Upload» (не через подключение Git — публикацию
   делает наш workflow).
3. Получить **Account ID**: он виден в URL панели и в правой колонке
   раздела Workers & Pages.
4. Создать **API-токен**: My Profile → API Tokens → Create Token →
   шаблон **Edit Cloudflare Workers** (или кастомный с правом
   `Account → Cloudflare Pages → Edit`). Токен показывается один раз —
   скопировать сразу.

## Шаг 2. Сервер для бэка (Hetzner)

1. Аккаунт на [hetzner.com](https://hetzner.com) → Cloud → новый проект.
2. Создать сервер: **CX22** (~€4/мес) хватает с запасом, образ **Ubuntu
   24.04**, локация **Nuremberg** или **Falkenstein** (ближе к Украине по
   латентности, чем Helsinki).
3. При создании добавить свой SSH-ключ — так вход будет по ключу, а не по
   паролю.
4. На сервере подготовить окружение:

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx

# Папка приложения
sudo mkdir -p /opt/building-site
sudo chown $USER:$USER /opt/building-site
```

5. Завести отдельного пользователя для деплоя и его SSH-ключ (не свой
   личный — если ключ утечёт из GitHub, отзывать нужно только его):

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo mkdir -p /home/deploy/.ssh
# Публичную часть ключа положить в /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /opt/building-site
```

Ключ для деплоя генерируется **локально**, на сервер уходит только
публичная часть:

```bash
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/building-site-deploy
```

6. Разрешить пользователю `deploy` перезапускать только наш сервис — без
   полного sudo. `sudo visudo -f /etc/sudoers.d/deploy`:

```
deploy ALL=(root) NOPASSWD: /bin/systemctl restart building-site-api
```

7. systemd-сервис `/etc/systemd/system/building-site-api.service`:

```ini
[Unit]
Description=Building-site API
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/building-site
EnvironmentFile=/opt/building-site/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable building-site-api
```

Файл `.env` создаётся **на сервере руками** (в репозиторий он не
попадает — см. `.gitignore`). Список переменных — в `backend/.env.example`.

8. nginx: проксировать `/api/` на локальный порт приложения, выдать HTTPS
   через `certbot --nginx`.

## Шаг 3. Секреты в GitHub

Settings → Secrets and variables → Actions → **New repository secret**:

| Имя | Что это |
|---|---|
| `CLOUDFLARE_API_TOKEN` | токен из шага 1.4 |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID из шага 1.3 |
| `SSH_HOST` | IP сервера Hetzner |
| `SSH_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | **приватная** часть ключа из шага 2.5, целиком, вместе со строками `-----BEGIN...` и `-----END...` |

Секреты видны только GitHub Actions — ни в логах, ни в интерфейсе их
после сохранения не посмотреть. В репозиторий их не коммитим никогда.

## Шаг 4. Домен

1. Купить домен `.ua` или `.com.ua` у украинского регистратора.
2. Делегировать на NS-серверы Cloudflare.
3. В Cloudflare Pages привязать домен к проекту (Custom domains).
4. Поддомен для API (например `api.домен`) — A-записью на IP сервера.
5. HTTPS: для фронта Cloudflare делает сам, для API — `certbot`.

---

## Проверка после настройки

1. Открыть вкладку **Actions** — оба workflow должны отработать зелёными
   и больше не писать «деплой пропущен».
2. Открыть сайт по домену — отдаётся свежая сборка.
3. Отправить тестовую заявку через форму.
4. Убедиться, что она **и** сохранилась на сервере, **и** дошла в
   уведомление. Обе части обязательны.
5. Прогнать навык `test-project`.

## Откат, если выкатили сломанное

Фронт: в панели Cloudflare Pages → Deployments → предыдущий деплой →
**Rollback**. Занимает секунды.

Бэк: откатить коммит в `main` и дождаться автодеплоя.

```bash
git checkout main && git pull
git revert <хеш плохого коммита>
git push
```

Пуш в `main` заблокирован хуком, поэтому откат делается через PR из `dev`
либо через веб-интерфейс GitHub (кнопка **Revert** на смердженном PR).
Если сайт лежит и PR ждать некогда — временно отключить хук на своей
машине можно `git config --unset core.hooksPath`, но **сразу вернуть
обратно** после починки.

## Чего в автодеплое пока нет

- **Staging-окружение.** Изменения едут из `main` сразу на прод.
  Пока проект маленький — приемлемо, но стоит завести перед первой
  рекламной кампанией.
- **Бэкапы заявок.** Сейчас данные живут только на сервере. Нужен
  регулярный дамп в другое место, иначе потеря диска = потеря всех
  заявок. Заведено в `TODO.md`.
- **Мониторинг.** Если сервис упадёт ночью, никто не узнает до утра.
  Минимум — бесплатный uptime-мониторинг с уведомлением в Telegram.
