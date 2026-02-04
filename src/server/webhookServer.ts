import express, { Request, Response } from 'express';
import { Telegraf } from 'telegraf';
import { PaymentService } from '../services/paymentService';
import { SubscriptionService } from '../services/subscriptionService';
import { PaymentWebhookHandler } from '../webhook/paymentWebhook';

/**
 * Пример сервера для обработки webhook от платежной системы
 * Используйте этот файл, если ваша платежная система отправляет webhook
 * 
 * Для запуска добавьте в package.json:
 * "webhook": "ts-node-dev --respawn --transpile-only src/server/webhookServer.ts"
 */

export function createWebhookServer(
  bot: Telegraf,
  paymentService: PaymentService,
  subscriptionService: SubscriptionService
) {
  const app = express();
  app.use(express.json());

  const webhookHandler = new PaymentWebhookHandler(bot, paymentService, subscriptionService);

  // Endpoint для обработки webhook от платежной системы
  app.post('/webhook/payment', async (req: Request, res: Response) => {
    try {
      // В реальном приложении здесь должна быть проверка подписи запроса
      // для безопасности (например, проверка HMAC подписи от Stripe/ЮKassa)
      
      const result = await webhookHandler.handlePaymentNotification(req.body);

      if (result.success) {
        res.status(200).json({ success: true, message: result.message });
      } else {
        res.status(400).json({ success: false, message: result.message });
      }
    } catch (error) {
      console.error('Ошибка при обработке webhook:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  return app;
}



