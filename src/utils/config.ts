import dotenv from 'dotenv';

dotenv.config();

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  paymentUrl: process.env.PAYMENT_URL || 'https://your-payment-system.com/payment',
  webhookUrl: process.env.WEBHOOK_URL || '',
  port: parseInt(process.env.PORT || '3000', 10),
  botUsername: process.env.BOT_USERNAME || '',
  
  // T‑Bank e-acquiring настройки
  tbank: {
    terminalKey: process.env.TBANK_TERMINAL_KEY || '',
    password: process.env.TBANK_PASSWORD || '',
    apiBaseUrl: process.env.TBANK_API_BASE_URL || 'https://securepay.tinkoff.ru/v2',
    publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
    successUrl: process.env.TBANK_SUCCESS_URL || '',
    failUrl: process.env.TBANK_FAIL_URL || '',
  },
  
  // Закрытый канал
  privateChannel: {
    // ID закрытого канала (формат: -100XXXXXXXXXX)
    channelId: process.env.PRIVATE_CHANNEL_ID || '',
    // Время жизни пригласительной ссылки в часах
    inviteLinkExpireHours: parseInt(process.env.INVITE_LINK_EXPIRE_HOURS || '12', 10),
  },
  
  // Валидация конфигурации
  validate(): void {
    if (!this.botToken) {
      throw new Error('BOT_TOKEN должен быть установлен в переменных окружения');
    }
  }
};


