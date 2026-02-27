import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { SubscriptionService } from './services/subscriptionService';
import { PaymentService } from './services/paymentService';
import { BotCommands } from './commands/commands';
import { BotHandlers } from './handlers/handlers';
import { createWebhookServer } from './server/webhookServer';
import { SubscriptionLifecycleService } from './services/subscriptionLifecycleService';

dotenv.config();

if (!process.env.BOT_TOKEN) {
  throw new Error('BOT_TOKEN должен быть установлен в переменных окружения');
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const subscriptionService = new SubscriptionService();
const paymentService = new PaymentService();
const lifecycleService = new SubscriptionLifecycleService(bot, subscriptionService);

// Инициализация команд и обработчиков
const handlers = new BotHandlers(bot, subscriptionService, paymentService);
const commands = new BotCommands(bot, subscriptionService, paymentService, handlers);

// Регистрация команд и обработчиков
commands.registerCommands();
handlers.registerHandlers();

bot.catch((err, ctx) => {
  console.error(`Ошибка для ${ctx.updateType}:`, err);
  void ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
});

const webhookServer = createWebhookServer(bot, paymentService, subscriptionService);
const PORT = parseInt(process.env.PORT || '3000', 10);
const BOT_LAUNCH_TIMEOUT_MS = parseInt(process.env.BOT_LAUNCH_TIMEOUT_MS || '30000', 10);

const startBot = async () => {
  try {
    console.log('🚀 Запуск Telegram бота...');
    console.log(`📋 NODE_ENV: ${process.env.NODE_ENV || 'не установлен'}`);
    console.log(`📋 PORT: ${PORT}`);
    console.log(`📋 BOT_TOKEN: ${process.env.BOT_TOKEN ? '***установлен***' : '❌ НЕ УСТАНОВЛЕН'}`);

    webhookServer.listen(PORT, '0.0.0.0', () => {
      console.log(`🌐 Webhook сервер запущен на 0.0.0.0:${PORT}`);
      console.log('💳 Payment return URLs: /payment/success , /payment/fail');
      console.log('❤️ Health check: /health');
    });

    const menuCommands = [
      { command: 'start', description: 'Запуск бота' },
      { command: 'help', description: 'Помощь и справка' },
      { command: 'plans', description: 'Посмотреть тарифы' },
      { command: 'my_subscription', description: 'Моя подписка' },
    ];

    await bot.telegram.setMyCommands(menuCommands);
    console.log('✅ Команды бота установлены');

    console.log(`⏳ Запускаю polling (timeout ${BOT_LAUNCH_TIMEOUT_MS}ms)...`);
    const launchPromise = bot.launch();

    const launchResult = await Promise.race<
      { status: 'launched' } | { status: 'error'; error: unknown } | { status: 'timeout' }
    >([
      launchPromise
        .then(() => ({ status: 'launched' as const }))
        .catch((error) => ({ status: 'error' as const, error })),
      new Promise<{ status: 'timeout' }>((resolve) => {
        setTimeout(() => resolve({ status: 'timeout' }), BOT_LAUNCH_TIMEOUT_MS);
      }),
    ]);

    if (launchResult.status === 'launched') {
      console.log('✅ Бот запущен в режиме polling');
    } else if (launchResult.status === 'error') {
      console.error('❌ Ошибка при запуске polling:', launchResult.error);
    } else {
      console.warn('⚠️ bot.launch() не завершился в таймаут. Продолжаю запуск и lifecycle job.');
      launchPromise
        .then(() => console.log('✅ Бот запущен в режиме polling (с задержкой)'))
        .catch((error) => console.error('❌ Ошибка polling (после таймаута):', error));
    }

    lifecycleService.start();

    process.once('SIGINT', () => {
      lifecycleService.stop();
      bot.stop('SIGINT');
    });
    process.once('SIGTERM', () => {
      lifecycleService.stop();
      bot.stop('SIGTERM');
    });
  } catch (error) {
    console.error('❌ Ошибка при запуске бота:', error);
    console.log('⚠️ Express сервер продолжает работать даже при ошибке бота');
  }
};

void startBot();

