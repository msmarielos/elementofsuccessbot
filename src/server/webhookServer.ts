import express, { Request, Response } from 'express';
import { Telegraf } from 'telegraf';
import { PaymentService } from '../services/paymentService';
import { SubscriptionService } from '../services/subscriptionService';
import { PaymentCompletionService } from '../services/paymentCompletionService';

/**
 * HTTP сервер для возвратов после оплаты (SuccessURL/FailURL) и healthcheck.
 * По сценарию T‑Bank WebView: после оплаты пользователь попадает на SuccessURL/FailURL,
 * а мы на сервере дополнительно проверяем платеж через GetState.
 */

export function createWebhookServer(
  bot: Telegraf,
  paymentService: PaymentService,
  subscriptionService: SubscriptionService
) {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';
  
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 🔍 Логирование ВСЕХ входящих HTTP-запросов
  app.use((req: Request, res: Response, next) => {
    console.log(`\n🌐 ======== HTTP ${req.method} ${req.path} ========`);
    console.log(`📅 Время: ${new Date().toISOString()}`);
    console.log(`📋 Content-Type: ${req.headers['content-type'] || 'не указан'}`);
    if (!isProduction) {
      console.log(`📡 IP: ${req.ip || req.connection.remoteAddress}`);
      console.log(`📋 User-Agent: ${req.headers['user-agent'] || 'не указан'}`);
    }
    if (!isProduction && req.method === 'POST') {
      console.log(`📦 Body (raw keys): ${Object.keys(req.body || {}).join(', ') || 'пустой'}`);
      console.log(`📦 Body:`, JSON.stringify(req.body, null, 2));
    }
    console.log(`🌐 ================================`);
    next();
  });

  const completionService = new PaymentCompletionService(bot, paymentService, subscriptionService);

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Корневой endpoint для проверки
  app.get('/', (req: Request, res: Response) => {
    res.status(200).json({ 
      status: 'running',
      bot: 'element_of_success_bot',
      paymentReturn: {
        successUrlPath: '/payment/success',
        failUrlPath: '/payment/fail',
      },
      timestamp: new Date().toISOString()
    });
  });

  // Страница возврата после оплаты (SuccessURL / FailURL)
  // По статье: после редиректа дополнительно проверяем статус платежа через GetState и сверяем Amount.
  app.get('/payment/success', (req: Request, res: Response) => {
    const botUsername = process.env.BOT_USERNAME || 'element_of_success_bot';

    const paymentIdRaw =
      (req.query.PaymentId as string | undefined) ||
      (req.query.paymentId as string | undefined) ||
      (req.query.PAYMENTID as string | undefined) ||
      (req.query.paymentid as string | undefined);

    const paymentId = paymentIdRaw ? String(paymentIdRaw) : '';

    let success = false;
    if (paymentId) {
      // Пытаемся завершить платеж (идемпотентно)
      void completionService.completeIfPaid(paymentId).then((result) => {
        if (!isProduction) {
          console.log('🔎 completeIfPaid result:', result);
        }
      });
      success = true; // страница "успешно" (фактическая проверка происходит на сервере)
    }
    
    // HTML страница с автоматическим редиректом и кнопкой
    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${success ? '✅ Оплата обрабатывается' : '❌ Ошибка оплаты'}</title>
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
    <h1>${success ? 'Платеж обрабатывается' : 'Ошибка оплаты'}</h1>
    <p>${success
      ? 'Мы проверяем статус платежа и активируем подписку. Нажмите кнопку ниже, чтобы вернуться в бота и при необходимости проверить оплату.'
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
    res.redirect('/payment/success');
  });

  // Catch-all для ВСЕХ остальных маршрутов — логируем что именно запрашивается
  app.use((req: Request, res: Response) => {
    console.log(`⚠️ 404 — Необработанный запрос: ${req.method} ${req.originalUrl}`);
    if (!isProduction) {
      console.log(`⚠️ Headers:`, JSON.stringify(req.headers, null, 2));
    }
    res.status(200).json({ 
      status: 'ok',
      message: `Route ${req.method} ${req.originalUrl} not found, but server is running`,
      availableRoutes: [
        'GET /',
        'GET /health',
        'GET /payment/success',
        'GET /payment/fail'
      ],
      timestamp: new Date().toISOString()
    });
  });

  return app;
}




