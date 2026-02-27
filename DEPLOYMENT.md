# 🚀 Деплой Telegram бота

Это руководство поможет запустить бота на сервере, чтобы он работал 24/7.

## Варианты хостинга

| Платформа | Бесплатный тариф | Сложность | Рекомендация |
|-----------|------------------|-----------|--------------|
| Railway   | ✅ $5/месяц      | Легко     | Для начала   |
| Render    | ✅ Есть          | Легко     | Хороший выбор|
| Fly.io    | ✅ Есть          | Средне    | Надёжный     |
| VPS       | ❌ ~$5/месяц     | Сложно    | Полный контроль |

---

## 1️⃣ Railway (рекомендуется)

### Шаги:

1. Загрузите проект на GitHub
2. Зайдите на [railway.app](https://railway.app) и авторизуйтесь через GitHub
3. Нажмите **"New Project"** → **"Deploy from GitHub repo"**
4. Выберите ваш репозиторий
5. Перейдите в **Variables** и добавьте:

```
BOT_TOKEN=ваш_токен_бота
TBANK_TERMINAL_KEY=ваш_terminal_key
TBANK_PASSWORD=ваш_password
PUBLIC_BASE_URL=https://your-domain.com
BOT_USERNAME=your_bot_username
PRIVATE_CHANNEL_ID=-100XXXXXXXXXX
```

6. Railway автоматически задеплоит бота!

---

## 2️⃣ Render

### Шаги:

1. Зайдите на [render.com](https://render.com)
2. Создайте **"Background Worker"** (не Web Service, т.к. бот использует polling)
3. Подключите GitHub репозиторий
4. Настройте:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
5. Добавьте переменные окружения (Environment)
6. Нажмите **Deploy**

---

## 3️⃣ Fly.io

### Установка CLI:

```bash
# Windows (PowerShell)
pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"

# Или через npm
npm install -g flyctl
```

### Деплой:

```bash
# Авторизация
fly auth login

# Создание приложения (выполнить в папке проекта)
fly launch

# Добавление секретов (переменных окружения)
fly secrets set BOT_TOKEN=ваш_токен
fly secrets set TBANK_TERMINAL_KEY=ваш_terminal_key
fly secrets set TBANK_PASSWORD=ваш_password
fly secrets set PUBLIC_BASE_URL=https://your-domain.com
fly secrets set BOT_USERNAME=your_bot_username
fly secrets set PRIVATE_CHANNEL_ID=-100XXXXXXXXXX

# Деплой
fly deploy
```

---

## 4️⃣ VPS сервер (DigitalOcean, Hetzner, Timeweb)

### Подготовка сервера:

```bash
# Подключение к серверу
ssh root@your-server-ip

# Обновление системы
apt update && apt upgrade -y

# Установка Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Установка PM2 для управления процессами
npm install -g pm2

# Установка Git
apt install -y git
```

### Деплой бота:

```bash
# Клонирование репозитория
git clone https://github.com/ваш-username/successelement.git
cd successelement

# Установка зависимостей
npm install

# Сборка проекта
npm run build

# Создание файла .env
cat > .env << EOF
BOT_TOKEN=ваш_токен
TBANK_TERMINAL_KEY=ваш_terminal_key
TBANK_PASSWORD=ваш_password
PUBLIC_BASE_URL=https://your-domain.com
BOT_USERNAME=your_bot_username
PRIVATE_CHANNEL_ID=-100XXXXXXXXXX
EOF

# Запуск через PM2
pm2 start dist/index.js --name "telegram-bot"

# Автозапуск при перезагрузке сервера
pm2 startup
pm2 save

# Просмотр логов
pm2 logs telegram-bot
```

### Полезные команды PM2:

```bash
pm2 status          # Статус всех процессов
pm2 restart all     # Перезапуск
pm2 stop all        # Остановка
pm2 logs            # Логи в реальном времени
pm2 monit           # Мониторинг ресурсов
```

---

## 🔧 Настройка Webhook (опционально)

Для продакшена рекомендуется использовать webhook вместо polling.

1. Получите домен (или используйте предоставленный хостингом)
2. Добавьте переменную окружения:

```
WEBHOOK_URL=https://ваш-домен.com/webhook
```

3. Бот автоматически переключится на webhook режим

---

## ❓ FAQ

**Q: Бот перестал работать после деплоя**
A: Проверьте логи (`pm2 logs` на VPS или в панели хостинга)

**Q: Как обновить бота?**
A: 
- Railway/Render: push в GitHub автоматически задеплоит
- VPS: `git pull && npm run build && pm2 restart telegram-bot`

**Q: Webhook не работает**
A: Убедитесь что URL доступен по HTTPS и порт открыт


