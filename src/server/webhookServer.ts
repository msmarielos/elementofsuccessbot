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

  // Страница возврата после оплаты CloudPayments
  // CloudPayments добавляет параметры к URL, которые Telegram не понимает
  // Поэтому делаем редирект на правильный deep link
  app.get('/payment/success', (req: Request, res: Response) => {
    const botUsername = process.env.BOT_USERNAME || 'element_of_success_bot';
    const success = req.query.Success === 'True';
    
    // HTML страница с автоматическим редиректом и кнопкой
    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${success ? '✅ Оплата успешна!' : '❌ Ошибка оплаты'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 20px;
      padding: 40px;
      text-align: center;
      max-width: 400px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .icon { font-size: 64px; margin-bottom: 20px; }
    h1 { color: #333; margin-bottom: 15px; font-size: 24px; }
    p { color: #666; margin-bottom: 30px; line-height: 1.6; }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      padding: 15px 40px;
      border-radius: 30px;
      font-weight: bold;
      font-size: 16px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '✅' : '❌'}</div>
    <h1>${success ? 'Оплата прошла успешно!' : 'Ошибка оплаты'}</h1>
    <p>${success 
      ? 'Ваша подписка активирована. Нажмите кнопку ниже, чтобы вернуться в бота.' 
      : 'Что-то пошло не так. Попробуйте ещё раз или обратитесь в поддержку.'}</p>
    <a href="https://t.me/${botUsername}?start=payment_${success ? 'success' : 'fail'}" class="btn">
      🤖 Вернуться в бота
    </a>
  </div>
</body>
</html>
    `;
    
    res.status(200).send(html);
  });

  // Редирект для fail URL
  app.get('/payment/fail', (req: Request, res: Response) => {
    res.redirect('/payment/success?Success=False');
  });

  return app;
}




