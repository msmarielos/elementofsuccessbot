import { Telegraf, Context } from 'telegraf';
import dotenv from 'dotenv';
import { SubscriptionService } from './services/subscriptionService';
import { PaymentService } from './services/paymentService';
import { BotCommands } from './commands/commands';
import { BotHandlers } from './handlers/handlers';
import { createWebhookServer } from './server/webhookServer';

dotenv.config();

if (!process.env.BOT_TOKEN) {
  throw new Error('BOT_TOKEN должен быть установлен в переменных окружения');
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const subscriptionService = new SubscriptionService();
const paymentService = new PaymentService();

// Инициализация команд и обработчиков
const handlers = new BotHandlers(bot, subscriptionService, paymentService);
const commands = new BotCommands(bot, subscriptionService, paymentService, handlers);

// Регистрация команд
commands.registerCommands();

// Регистрация обработчиков
handlers.registerHandlers();

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error(`Ошибка для ${ctx.updateType}:`, err);
  ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
});

// Создаем webhook сервер для обработки платежей от CloudPayments
const webhookServer = createWebhookServer(bot, paymentService, subscriptionService);
const PORT = parseInt(process.env.PORT || '3000', 10);

// Запуск бота
const startBot = async () => {
  try {
    console.log('🚀 Запуск Telegram бота...');
    
    // Установка команд меню бота
    const menuCommands = [
      {
        command: "start",
        description: "Запуск бота"
      },
      {
        command: "help",
        description: "Помощь и справка"
      }
    ];
    
    await bot.telegram.setMyCommands(menuCommands);
    console.log('✅ Команды бота установлены');
    
    // Запускаем webhook сервер для CloudPayments
    webhookServer.listen(PORT, () => {
      console.log(`🌐 Webhook сервер запущен на порту ${PORT}`);
      console.log(`📡 CloudPayments webhook URL: /webhook/cloudpayments`);
    });
    
    // Запускаем бота в режиме polling (для продакшена)
    await bot.launch();
    console.log('✅ Бот запущен в режиме polling');
    
    // Graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (error) {
    console.error('❌ Ошибка при запуске бота:', error);
    process.exit(1);
  }
};

startBot();


