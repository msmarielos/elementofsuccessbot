import express, { Request, Response } from 'express';
import { Telegraf } from 'telegraf';
import { InlineKeyboardMarkup } from 'telegraf/types';
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

  // Webhook уведомления от T‑Bank.
  app.post('/payment/webhook', async (req: Request, res: Response) => {
    const body = (req.body || {}) as Record<string, any>;

    // Для T‑Bank важен буквальный ответ 200:OK, иначе уведомление считается непринятым.
    const ack = () => res.status(200).send('OK');

    if (!paymentService.isValidWebhookToken(body)) {
      console.warn('⚠️ Получено webhook-уведомление с невалидным Token');
      return ack();
    }

    const paymentIdRaw =
      body.PaymentId ||
      body.paymentId ||
      body.PAYMENTID ||
      body.paymentid;
    const paymentId = paymentIdRaw ? String(paymentIdRaw) : '';
    if (!paymentId) {
      console.warn('⚠️ Webhook без PaymentId, пропускаю');
      return ack();
    }

    const status = String(body.Status || '').toUpperCase();
    console.log(`🔔 T‑Bank webhook: PaymentId=${paymentId}, Status=${status || 'UNKNOWN'}`);

    try {
      if (status === 'CONFIRMED' || status === 'AUTHORIZED') {
        const result = await completionService.completeIfPaid(paymentId);
        console.log(
          `✅ Webhook success обработан: PaymentId=${paymentId}, Status=${status}, Activated=${result.success}, Message=${result.message || 'n/a'}`
        );
        return ack();
      }

      if (status === 'REJECTED' || status === 'CANCELED' || status === 'DEADLINE_EXPIRED') {
        paymentService.markPaymentFailed(paymentId);
        console.log(`❌ Webhook fail статус: PaymentId=${paymentId}, Status=${status} (marked failed)`);

        const record = paymentService.getPaymentRecord(paymentId);
        if (!record) {
          console.warn(`⚠️ Webhook fail: запись платежа не найдена для PaymentId=${paymentId}`);
          return ack();
        }

        const plan = subscriptionService.getPlanById(record.planId);
        if (!plan) {
          await bot.telegram.sendMessage(
            record.userId,
            `❌ Оплата не прошла (статус: ${status}).\n\nПопробуйте снова из меню подписок.`
          );
          return ack();
        }

        const { paymentUrl, paymentId: newPaymentId } = await paymentService.createPaymentLink(
          record.userId,
          plan,
          record.chatId
        );
        console.log(
          `🔁 Создана новая ссылка после fail: OldPaymentId=${paymentId}, NewPaymentId=${newPaymentId}, UserId=${record.userId}`
        );

        const keyboard: InlineKeyboardMarkup = {
          inline_keyboard: [
            [{ text: '💳 Оплатить снова', url: paymentUrl }],
            [{ text: '✅ Проверить оплату', callback_data: `check_payment_${plan.id}_${newPaymentId}` }],
          ],
        };

        await bot.telegram.sendMessage(
          record.userId,
          `❌ Оплата не прошла (статус: ${status}).\n\nМы уже создали новую ссылку, можно попробовать еще раз:`,
          { reply_markup: keyboard }
        );
        console.log(`📨 Пользователь уведомлен о неуспешной оплате: UserId=${record.userId}, PaymentId=${paymentId}`);
        return ack();
      }

      console.log(`ℹ️ Webhook статус без явной обработки: PaymentId=${paymentId}, Status=${status}`);
    } catch (error) {
      console.error('❌ Ошибка обработки payment webhook:', error);
    }

    return ack();
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
        'POST /payment/webhook',
        'GET /payment/success',
        'GET /payment/fail'
      ],
      timestamp: new Date().toISOString()
    });
  });

  return app;
}




