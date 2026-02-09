import dotenv from 'dotenv';

dotenv.config();

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  paymentUrl: process.env.PAYMENT_URL || 'https://your-payment-system.com/payment',
  webhookUrl: process.env.WEBHOOK_URL || '',
  port: parseInt(process.env.PORT || '3000', 10),
  botUsername: process.env.BOT_USERNAME || '',
  
  // CloudPayments настройки
  cloudPayments: {
    publicId: process.env.CLOUDPAYMENTS_PUBLIC_ID || '',
    apiSecret: process.env.CLOUDPAYMENTS_API_SECRET || '',
    returnUrl: process.env.CLOUDPAYMENTS_RETURN_URL || '',
    webhookUrl: process.env.CLOUDPAYMENTS_WEBHOOK_URL || '',
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


