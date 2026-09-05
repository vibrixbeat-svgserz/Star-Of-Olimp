# Star of Olimp — Telegram Mini App

Профессиональная сборка: frontend (Telegram Mini App) + backend (Express).

## Структура

```
star-of-olimp/
  public/index.html   — интерфейс Mini App
  server/index.js     — API + раздача статики
  server/package.json
  README.md
```

## Возможности

- **Покупка билетов** — только за настоящие Telegram Stars (XTR)
- **Пополнение баланса** — через настоящие Telegram Stars
- **Вывод** — заявки + быстрый переход в бота (`/withdraw`)
- Задания за звёзды
- Конкурсы и аукционы
- Чат
- Реферальная система
- **Ежедневный бонус** — случайные билеты (1–5)
  - Требования: подписка на канал + поделиться + **сторис с каналом**
  - Серия 7 дней → +3 билета и +50 ★
- Подписка / шаринг / сторис (разовые бонусы ★)
- **Промокоды**: активация в Бонусах; создание в админке
- Профиль из Telegram: имя, @username, аватар
- **Админ-меню скрыто**: 5 быстрых нажатий по логотипу (в шапке)
- Главный админ: `dominik` / `9944191qqq`
- Вкладка **Админы**: назначить по ID + свой логин/пароль

## Что вписать в BotFather (пошагово)

1. Откройте [@BotFather](https://t.me/BotFather)
2. Создайте бота:
   ```
   /newbot
   ```
   - Имя: `Star of Olimp` (или любое)
   - Username: например `olimps_stars_bot` (должен заканчиваться на `_bot`)
3. Сохраните **токен** бота (формат `123456789:AAH...`) — он понадобится для backend.
4. Настройте Mini App:
   ```
   /mybots → выберите бота → Bot Settings → Menu Button
   ```
   или
   ```
   /newapp
   ```
   - Title: `Star of Olimp`
   - Description: `Задания, бонусы, конкурсы и билеты за Telegram Stars`
   - Photo: квадратное лого 512×512
   - Web App URL: `https://ВАШ-ДОМЕН.up.railway.app` (после деплоя)
5. Команды бота (`/setcommands`):
   ```
   start - Главное меню и открытие приложения
   topup - Пополнить баланс звёздами
   withdraw - Вывод средств
   help - Помощь и поддержка
   ```
6. Описание:
   ```
   /setdescription
   ```
   Текст:
   ```
   ⭐ Star of Olimp — задания, бонусы, конкурсы и билеты за настоящие Telegram Stars.
   Канал: @olimps_stars
   ```
7. About:
   ```
   /setabouttext
   ```
   Текст:
   ```
   Зарабатывай Telegram Stars, выполняй задания, участвуй в конкурсах и получай ежедневные бонусы. Подписывайся на @olimps_stars
   ```
8. Платежи Stars (XTR):
   - `/mybots` → бот → Payments
   - Убедитесь, что бот может принимать Telegram Stars
9. Привязка канала (рекомендуется):
   - Добавьте бота администратором в канал @olimps_stars (права: «Добавление участников» / «Управление чатом» не обязательны, но для проверки подписки бот должен видеть участников).
   - Это нужно, чтобы в продакшене работать `getChatMember` и реально проверять подписку.

**Важно:** замените в `public/index.html` константы:
```js
const CHANNEL_URL = 'https://t.me/olimps_stars';
const CHANNEL_USERNAME = 'olimps_stars';
const BOT_USERNAME = 'olimps_stars_bot';  // ← ваш реальный username бота
const STORY_MEDIA = 'https://...';       // красивое изображение для сторис
```

## Локально

```bash
cd server
npm install
npm start
```

Откройте: http://localhost:3000

Для теста Mini App внутри Telegram используйте туннель (ngrok / cloudflared) и укажите URL в BotFather.

## Онлайн (GitHub + Railway / Render)

1. Создайте репозиторий на GitHub и залейте папку `star-of-olimp`
2. Railway.app или Render.com → New Project → Deploy from GitHub
3. Root Directory: `server`
4. Start Command: `npm start`
5. Добавьте переменную окружения (когда подключите реальные платежи):
   - `BOT_TOKEN` = токен от BotFather
6. Скопируйте публичный URL (https://....up.railway.app)
7. В BotFather → /newapp или Menu Button → вставьте этот URL

## Реальные платежи Telegram Stars (XTR)

В текущей версии frontend использует `payWithStars()` с демо-подтверждением.  
Для продакшена:

1. На бэкенде добавьте эндпоинт, который вызывает:
   ```
   POST https://api.telegram.org/bot<BOT_TOKEN>/createInvoiceLink
   {
     "title": "Пополнение 150 ★",
     "description": "...",
     "payload": "topup_150_user123",
     "currency": "XTR",
     "prices": [{"label": "150 Stars", "amount": 150}]
   }
   ```
2. Верните `invoice_link` на фронт
3. Вызовите `Telegram.WebApp.openInvoice(link, callback)`
4. В callback при статусе `paid` начисляйте баланс / билеты (лучше через webhook `pre_checkout_query` + `successful_payment` для безопасности)

## Важно

- Данные сейчас в памяти (при рестарте сервера сбрасываются)
- Для продакшена подключите MongoDB / PostgreSQL / Redis
- Проверка подписки на канал — через `getChatMember` Bot API
- Сторис: используется `Telegram.WebApp.shareToStory` (доступно с версии WebApp 7.8+)
- Пополнение и вывод можно дублировать командами бота (`/topup`, `/withdraw`)

## Админ-панель

- 5 быстрых тапов по золотому логотипу в шапке
- После первого успешного входа права сохраняются — следующие 5 тапов сразу открывают панель
- Логин/пароль главного админа: `dominik` / `9944191qqq`
- Можно добавлять дополнительных админов по Telegram ID + свой логин/пароль
- Вход через модальное окно (стабильно работает в Telegram WebView)

Сделано профессионально: читаемый контрастный текст, аватар / ник / ID из Telegram, стабильный админ-вход без багов.
