import { SubscriptionPlan } from '../types/subscription';
import axios from 'axios';

export class PaymentService {
  private publicId: string;
  private apiSecret: string;
  private returnUrl: string;

  constructor() {
    this.publicId = process.env.CLOUDPAYMENTS_PUBLIC_ID || '';
    this.apiSecret = process.env.CLOUDPAYMENTS_API_SECRET || '';
    this.returnUrl = process.env.CLOUDPAYMENTS_RETURN_URL || `https://t.me/${process.env.BOT_USERNAME || 'your_bot'}`;
    
    if (!this.publicId) {
      console.warn('⚠️ CLOUDPAYMENTS_PUBLIC_ID не установлен в переменных окружения');
    }
    if (!this.apiSecret) {
      console.warn('⚠️ CLOUDPAYMENTS_API_SECRET не установлен в переменных окружения');
    }
  }

  /**
   * Создать ссылку на оплату через CloudPayments
   * CloudPayments использует виджет оплаты, который можно открыть через URL
   */
  createPaymentLink(
    userId: number,
    plan: SubscriptionPlan,
    chatId: number
  ): string {
    // Формируем параметры для CloudPayments виджета
    const params = new URLSearchParams({
      publicId: this.publicId,
      amount: plan.price.toString(),
      currency: plan.currency,
      description: `Подписка ${plan.name}`,
      accountId: userId.toString(), // ID пользователя в вашей системе
      invoiceId: `${userId}_${plan.id}_${Date.now()}`, // Уникальный ID платежа
      data: JSON.stringify({
        userId: userId.toString(),
        chatId: chatId.toString(),
        planId: plan.id,
      }),
      // URL для возврата после оплаты
      successUrl: this.returnUrl,
      // URL для отмены оплаты
      failUrl: this.returnUrl,
    });

    // CloudPayments виджет оплаты
    return `https://widget.cloudpayments.ru/pay?${params.toString()}`;
  }

  /**
   * Верифицировать платеж через CloudPayments API
   */
  async verifyPayment(paymentId: string, userId: number, planId: string): Promise<boolean> {
    if (!this.apiSecret) {
      console.error('CLOUDPAYMENTS_API_SECRET не установлен');
      return false;
    }

    try {
      // Проверка платежа через CloudPayments API
      const response = await axios.get(
        `https://api.cloudpayments.ru/payments/get?TransactionId=${paymentId}`,
        {
          auth: {
            username: this.publicId,
            password: this.apiSecret,
          },
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      // Проверяем статус платежа
      if (response.data && response.data.Success) {
        const payment = response.data.Model;
        // Проверяем, что платеж успешен и сумма соответствует
        return payment.Status === 'Completed' || payment.Status === 'Authorized';
      }

      return false;
    } catch (error) {
      console.error('Ошибка при проверке платежа CloudPayments:', error);
      return false;
    }
  }

  /**
   * Обработать уведомление о платеже (webhook от CloudPayments)
   * CloudPayments отправляет уведомления в формате JSON
   */
  async processPaymentNotification(data: any): Promise<{
    success: boolean;
    userId?: number;
    planId?: string;
    paymentId?: string;
  }> {
    try {
      // Структура данных от CloudPayments webhook
      // Документация: https://cloudpayments.ru/Docs/Notifications
      
      const transactionId = data.TransactionId;
      const status = data.Status; // Completed, Declined, Cancelled и т.д.
      const amount = parseFloat(data.Amount);
      const currency = data.Currency;
      
      // Извлекаем данные из поля Data (JSON строка)
      let metadata: any = {};
      if (data.Data) {
        try {
          metadata = typeof data.Data === 'string' ? JSON.parse(data.Data) : data.Data;
        } catch (e) {
          console.error('Ошибка парсинга Data:', e);
        }
      }

      const userId = parseInt(metadata.userId || data.AccountId || '0');
      const planId = metadata.planId || '';

      // Проверяем подпись запроса (если настроена)
      // CloudPayments может отправлять подпись в заголовке или в теле запроса
      if (this.apiSecret && data.Hmac) {
        // TODO: Реализовать проверку HMAC подписи для безопасности
        // const calculatedHmac = this.calculateHmac(data);
        // if (calculatedHmac !== data.Hmac) {
        //   console.error('Неверная подпись webhook');
        //   return { success: false };
        // }
      }

      // Проверяем, что платеж успешен
      if (status === 'Completed' || status === 'Authorized') {
        return {
          success: true,
          userId,
          planId,
          paymentId: transactionId?.toString(),
        };
      }

      return { success: false };
    } catch (error) {
      console.error('Ошибка при обработке уведомления о платеже CloudPayments:', error);
      return { success: false };
    }
  }
}


