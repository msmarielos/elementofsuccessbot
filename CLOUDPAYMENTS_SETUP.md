# Настройка CloudPayments

## Необходимые данные из личного кабинета CloudPayments

Для интеграции с CloudPayments вам понадобятся следующие данные из личного кабинета на сайте [cloudpayments.ru](https://cloudpayments.ru):

### 1. Public ID (Публичный идентификатор)
- Где найти: Настройки → Интеграция → Публичный идентификатор
- Это публичный ключ, который используется для создания платежных форм
- Пример: `pk_1234567890abcdef`

### 2. API Secret (Секретный ключ)
- Где найти: Настройки → Интеграция → API Secret
- Это секретный ключ для подписи запросов и проверки webhook'ов
- Пример: `1234567890abcdef1234567890abcdef`
- ⚠️ **ВАЖНО**: Никогда не публикуйте этот ключ в открытом доступе!

### 3. Webhook URL (URL для уведомлений)
- Где найти: Настройки → Уведомления → URL для уведомлений
- Это URL вашего сервера, на который CloudPayments будет отправлять уведомления о платежах
- Пример: `https://your-domain.com/webhook/cloudpayments`
- Для локальной разработки можно использовать ngrok: `https://your-ngrok-url.ngrok.io/webhook/cloudpayments`

## Что добавить в файл .env

Добавьте следующие переменные в ваш файл `.env`:

```env
# CloudPayments настройки
CLOUDPAYMENTS_PUBLIC_ID=ваш_public_id
CLOUDPAYMENTS_API_SECRET=ваш_api_secret
CLOUDPAYMENTS_WEBHOOK_URL=https://your-domain.com/webhook/cloudpayments

# URL для возврата после оплаты (опционально)
CLOUDPAYMENTS_RETURN_URL=https://t.me/your_bot_username
```

## Дополнительная информация

### Тестовый режим
CloudPayments предоставляет тестовые ключи для разработки:
- Тестовый Public ID: `pk_test_...`
- Тестовый API Secret: `test_...`

### Типы платежей
CloudPayments поддерживает:
- Одноразовые платежи (Payment)
- Регулярные платежи (Recurring)
- Двухстадийные платежи (Two-Stage)

### Валюта
Убедитесь, что валюта в коде соответствует валюте в настройках магазина CloudPayments (обычно RUB для России).

## Следующие шаги

1. Получите Public ID и API Secret из личного кабинета CloudPayments
2. Добавьте их в файл `.env`
3. Настройте webhook URL в личном кабинете CloudPayments
4. Обновите код `paymentService.ts` для работы с CloudPayments API



