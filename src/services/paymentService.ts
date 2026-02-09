import { SubscriptionPlan } from '../types/subscription';
import axios from 'axios';

export class PaymentService {
  private publicId: string;
  private apiSecret: string;
  private returnUrl: string;

  constructor() {
    this.publicId = process.env.CLOUDPAYMENTS_PUBLIC_ID || '';
    this.apiSecret = process.env.CLOUDPAYMENTS_API_SECRET || '';
    // URL страницы возврата на нашем сервере (она сделает редирект в бота)
    this.returnUrl = process.env.CLOUDPAYMENTS_RETURN_URL || '';
    
    if (!this.publicId) {
      console.warn('⚠️ CLOUDPAYMENTS_PUBLIC_ID не установлен в переменных окружения');
    }
    if (!this.apiSecret) {
      console.warn('⚠️ CLOUDPAYMENTS_API_SECRET не установлен в переменных окружения');
    }
    if (!this.returnUrl) {
      console.warn('⚠️ CLOUDPAYMENTS_RETURN_URL не установлен - укажите URL вашего сервера/payment/success');
    }
  }

  /**
   * Создать ссылку на оплату через CloudPayments API
   * Метод /orders/create создает платежную ссылку
   */
  async createPaymentLink(
    userId: number,
    plan: SubscriptionPlan,
    chatId: number
  ): Promise<string> {
    try {
      const invoiceId = `${userId}_${plan.id}_${Date.now()}`;
      
      // Создаем заказ через CloudPayments API
      const response = await axios.post(
        'https://api.cloudpayments.ru/orders/create',
        {
          Amount: plan.price,
          Currency: plan.currency,
          Description: `Подписка "${plan.name}" - Элемент успеха`,
          AccountId: userId.toString(),
          InvoiceId: invoiceId,
          Email: '', // Опционально
          JsonData: {
            userId: userId.toString(),
            chatId: chatId.toString(),
            planId: plan.id,
          },
          // URLs для возврата
          SuccessRedirectUrl: this.returnUrl,
          FailRedirectUrl: this.returnUrl,
        },
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

      if (response.data && response.data.Success && response.data.Model) {
        // Возвращаем URL платежной формы
        console.log('✅ Создана платежная ссылка:', response.data.Model.Url);
        return response.data.Model.Url;
      } else {
        console.error('❌ Ошибка создания заказа CloudPayments:', response.data);
        throw new Error(response.data?.Message || 'Ошибка создания платежа');
      }
    } catch (error: any) {
      console.error('❌ Ошибка при создании платежной ссылки:', error.response?.data || error.message);
      throw error;
    }
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
   * CloudPayments отправляет уведомления в формате CloudPayments (form-urlencoded) или JSON
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
      const amount = data.Amount;
      const currency = data.Currency;
      const invoiceId = data.InvoiceId || '';
      const accountId = data.AccountId || '';
      
      console.log(`📋 Webhook поля: TransactionId=${transactionId}, Status=${status}, Amount=${amount}, Currency=${currency}`);
      console.log(`📋 AccountId=${accountId}, InvoiceId=${invoiceId}`);
      console.log(`📋 Data (тип: ${typeof data.Data}):`, data.Data);
      
      // Извлекаем данные из поля Data (JSON строка или объект)
      let metadata: any = {};
      if (data.Data) {
        try {
          let parsed = typeof data.Data === 'string' ? JSON.parse(data.Data) : data.Data;
          // Защита от двойной сериализации — если после парсинга всё ещё строка, парсим ещё раз
          if (typeof parsed === 'string') {
            parsed = JSON.parse(parsed);
          }
          metadata = parsed;
          console.log('✅ Data распарсен:', JSON.stringify(metadata));
        } catch (e) {
          console.error('⚠️ Ошибка парсинга Data:', e);
        }
      } else {
        console.log('⚠️ Поле Data отсутствует в webhook');
      }

      // Получаем userId: из Data → AccountId → 0
      const userId = parseInt(metadata.userId || accountId || '0');
      
      // Получаем planId: из Data → из InvoiceId (формат: userId_planId_timestamp) → пустая строка
      let planId = metadata.planId || '';
      if (!planId && invoiceId) {
        // InvoiceId имеет формат: ${userId}_${planId}_${timestamp}
        // planId может содержать '_' (например: "1_month"), поэтому убираем первый и последний сегменты
        const parts = invoiceId.split('_');
        if (parts.length >= 3) {
          // Убираем первый элемент (userId) и последний (timestamp)
          planId = parts.slice(1, -1).join('_');
          console.log(`🔄 planId извлечён из InvoiceId: "${planId}"`);
        }
      }
      
      console.log(`👤 Итого: userId=${userId}, planId="${planId}"`);

      // Проверяем, что платеж успешен
      if (status === 'Completed' || status === 'Authorized') {
        if (!userId || userId === 0) {
          console.error('❌ Платеж успешен, но userId не определён!');
          return { success: false };
        }
        if (!planId) {
          console.error('❌ Платеж успешен, но planId не определён!');
          return { success: false };
        }
        
        return {
          success: true,
          userId,
          planId,
          paymentId: transactionId?.toString(),
        };
      }

      console.log(`⚠️ Статус платежа "${status}" — не Completed/Authorized, пропускаем`);
      return { success: false };
    } catch (error) {
      console.error('❌ Ошибка при обработке уведомления о платеже CloudPayments:', error);
      return { success: false };
    }
  }
}


