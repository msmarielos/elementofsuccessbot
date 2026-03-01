# Настройка T‑Bank (интернет‑эквайринг) для бота

Интеграция сделана по сценарию **WebView / PaymentURL**: сервер инициирует платеж, получает `PaymentURL`, бот отдаёт ссылку пользователю, а после оплаты сервер **дополнительно проверяет статус платежа** через `GetState`.

Официальная статья (мобильный сценарий): `https://developer.tbank.ru/eacq/scenarios/payments/mobile/`

## Что нужно в личном кабинете T‑Bank

- **TerminalKey** (ключ терминала)
- **Password** (пароль терминала)

В статье отдельно подчёркнуто:
- запросы к API делаем **только с вашего сервера**
- запросы **подписываем токеном**
- пользователю открываем именно `PaymentURL`

## Переменные окружения (.env)

```env
# Telegram
BOT_TOKEN=ваш_токен_бота
BOT_USERNAME=your_bot_username

# Публичный URL вашего сервера (нужен для SuccessURL/FailURL)
PUBLIC_BASE_URL=https://your-domain.com

# T‑Bank e-acquiring
TBANK_TERMINAL_KEY=ваш_terminal_key
TBANK_PASSWORD=ваш_password

# (опционально) если нужно переопределить базовый API URL
TBANK_API_BASE_URL=https://securepay.tinkoff.ru/v2

# (опционально) если хотите задать SuccessURL/FailURL явно
# TBANK_SUCCESS_URL=https://your-domain.com/payment/success
# TBANK_FAIL_URL=https://your-domain.com/payment/fail

# Закрытый канал (для инвайт-ссылки после оплаты)
PRIVATE_CHANNEL_ID=-100XXXXXXXXXX
INVITE_LINK_EXPIRE_HOURS=12
```

## Возврат после оплаты

В `Init` передаются:
- `SuccessURL = ${PUBLIC_BASE_URL}/payment/success`
- `FailURL` не передается (чтобы при неуспехе оставаться в платежном сценарии и повторить оплату)

После успешной оплаты пользователь попадает на `SuccessURL`, а сервер делает проверку через `GetState` (как в статье) и редиректит в Telegram-бота.

Пример успешного возврата:

```text
https://t.me/your_bot_username?start=payment_success_123456789
```

Где `123456789` — это `PaymentId` от T-Bank.

## Тестовые платежи

T‑Bank генерирует **уникальный `PaymentURL` для каждого платежа** на стороне банка, поэтому фиксированной “тестовой” ссылки нет – она всегда приходит в ответе `Init` в поле `PaymentURL`.

Для тестирования:

1. Запусти бота локально или на тестовом стенде.
2. В Telegram нажми **«ОФОРМИТЬ ПОДПИСКУ»** → выбери тариф → бот создаст платеж и залогирует ссылку:
   - в логах сервера будет строка вида  
     `✅ Создана платежная ссылка T‑Bank: https://securepay.tinkoff.ru/... PaymentId=123456789`
3. Перейди по этой ссылке (это и есть тестовая ссылка на оплату для конкретного заказа).
4. Оплати минимальную сумму (для тестов можно завести отдельный “тестовый” тариф с небольшой ценой).

Пример формата ссылки (упрощённо):

```text
https://securepay.tinkoff.ru/new/Acquiring/Payment/Index/1234567890-abcdef?context=...
```

Это только пример формы URL – **реальная ссылка всегда приходит от банка в ответе `PaymentURL`**.



