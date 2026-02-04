import express, { Request, Response } from 'express';
import { Telegraf } from 'telegraf';
import { PaymentService } from '../services/paymentService';
import { SubscriptionService } from '../services/subscriptionService';
import { PaymentWebhookHandler } from '../webhook/paymentWebhook';

/**
 * Сервер для обработки webhook от CloudPayments
 * CloudPayments отправляет уведомления о платежах на этот endpoint
 */

export function createWebhookServer(
  bot: Telegraf,
  paymentService: PaymentService,
  subscriptionService: SubscriptionService
) {
  const app = express();
  
  // CloudPayments отправляет данные как application/x-www-form-urlencoded или JSON
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const webhookHandler = new PaymentWebhookHandler(bot, paymentService, subscriptionService);

  // Endpoint для обработки webhook от CloudPayments
  // URL: https://amvera-elementofsuccess-run-elementbot.amvera.io/webhook/cloudpayments
  app.post('/webhook/cloudpayments', async (req: Request, res: Response) => {
    try {
      console.log('📥 Получен webhook от CloudPayments:', JSON.stringify(req.body, null, 2));
      
      const result = await webhookHandler.handlePaymentNotification(req.body);

      // CloudPayments требует ответ в формате { "code": 0 } для успешной обработки
      // code: 0 - успешно, другие коды - ошибка
      if (result.success) {
        console.log('✅ Платеж успешно обработан');
        res.status(200).json({ code: 0 });
      } else {
        console.log('⚠️ Платеж не обработан:', result.message);
        // Возвращаем code: 0 даже при неуспехе, чтобы CloudPayments не повторял запрос
        // Если нужно повторить - верните другой код
        res.status(200).json({ code: 0 });
      }
    } catch (error) {
      console.error('❌ Ошибка при обработке webhook:', error);
      res.status(200).json({ code: 0 }); // CloudPayments требует 200 ответ
    }
  });

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Корневой endpoint для проверки
  app.get('/', (req: Request, res: Response) => {
    res.status(200).json({ 
      status: 'running',
      bot: 'element_of_success_bot',
      webhookUrl: '/webhook/cloudpayments'
    });
  });

  return app;
}




