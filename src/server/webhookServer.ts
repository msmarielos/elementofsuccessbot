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

    // После успешного возврата из платежки сразу переводим пользователя в Telegram-бота.
    // Добавляем paymentId в deep-link, чтобы бот мог показать более точный контекст платежа.
    const startParam = success && paymentId
      ? `payment_success_${encodeURIComponent(paymentId)}`
      : (success ? 'payment_success' : 'payment_fail');
    res.redirect(`https://t.me/${botUsername}?start=${startParam}`);
  });

  // Fail URL не редиректит в success и не уводит пользователя в бота автоматически.
  app.get('/payment/fail', (req: Request, res: Response) => {
    res.status(200).send('Оплата не завершена. Вернитесь в платежную форму и попробуйте снова.');
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




