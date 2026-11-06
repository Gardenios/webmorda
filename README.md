# webmorda — веб-панель Madness Mini App

Клиентская часть Telegram Mini App для бота игры Madness: панель, в которой игрок
запускает своего бота, настраивает боссов, работы, PvP и смотрит логи.
Чистые HTML/CSS/JS, без сборки и без зависимостей.

Сервер (Python) в этот репозиторий не входит: он раздаёт эти файлы, проверяет
подпись Telegram и выполняет запросы к игре.

## Файлы

| Файл | Что это |
|---|---|
| `index.html` | страница; подключает Telegram WebApp SDK и `app.js` |
| `app.js` | вся логика: вкладки, формы, опрос статуса |
| `app.css` | стили (темы берутся из цветов Telegram) |

## Правила

- Только свой код: внешние скрипты, кроме `https://telegram.org/js/telegram-web-app.js`,
  запрещены CSP сервера. Шрифты, библиотеки, картинки — класть в репозиторий или не использовать.
- Никаких секретов в коде: токены, ключи, id пользователей сюда не пишем.
- Язык интерфейса и комментариев — русский.
- Проверка синтаксиса перед коммитом: `node --check app.js`.

## Как клиент говорит с сервером

Все запросы идут на тот же адрес, с которого открыта панель: `POST` с JSON, в заголовке `X-Telegram-Init-Data` — `Telegram.WebApp.initData`
(без него сервер отвечает 403). Ответ — `{"ok": true, ...}` или `{"ok": false, "error": "текст"}`.

| Адрес | Что делает |
|---|---|
| `/api/me` | кто я, статус доступа (`pending` / `approved` / `blocked`), админ ли |
| `/api/call` | `{"method", "params"}` — метод бота пользователя, ответ в `result` |
| `/api/account/<действие>` | подключение игрового аккаунта: `send_code`, `code`, `password`, `manual`, `import_code`, `disconnect` |
| `/api/admin/<действие>` | только админ: `users`, `set`, `recheck`, `stop_bot` |

Методы `/api/call`: `status`, `get_logs`, `clear_logs`, `start`, `stop`, `load_player`,
`get_config`, `set_config`, `set_boss`, `bosses_bulk`, `set_general_boss`, `bosses`, `boss_info`,
`works`, `work_info`, `friends`, `clans`, `equipment`, `upgrade_item`, `auto_upgrade_item`,
`stop_job`, `mutagens`, `mutagen_items`, `mutagen_action`, `upgrade_stat`, `heal_limit`,
`buy_heals`, `shop`, `shop_buy`, `businesses`, `businesses_collect`, `scan`, `clan_send`,
`refresh_token`. Новый метод нужен и на сервере — пишите владельцу.

Панель опрашивает `status` и `get_logs` раз в 2,5 с. Когда в `status.caches` меняется
версия, списки (боссы, работы, кланы) перезагружаются.

## Как проверить изменения

Initdata есть только внутри Telegram, поэтому панель проверяется в самом Mini App.
Изменения попадают на сервер после того, как владелец заберёт их (`git pull`) —
перезапуск сервера не нужен, файлы читаются при каждом запросе. Сбросить кеш в
Telegram: закрыть Mini App и открыть заново.

Работа — через ветки и pull request в `main`.
