import { Telegraf, Context } from 'telegraf';
import dotenv from 'dotenv';
import { SubscriptionService } from './services/subscriptionService';
import { PaymentService } from './services/paymentService';
import { BotCommands } from './commands/commands';
import { BotHandlers } from './handlers/handlers';

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

// Запуск бота
const startBot = async () => {
  try {
    console.log('Запуск Telegram бота...');
    
    // Установка команд меню бота
    const commands = [
      {
        command: "start",
        description: "Запуск бота"
      },
      {
        command: "help",
        description: "Помощь и справка"
      }
    ];
    
    await bot.telegram.setMyCommands(commands);
    console.log('Команды бота установлены');
    
    // Для разработки используем polling, для продакшена - webhook
    if (process.env.WEBHOOK_URL) {
      await bot.telegram.setWebhook(process.env.WEBHOOK_URL);
      console.log('Webhook установлен:', process.env.WEBHOOK_URL);
    } else {
      await bot.launch();
      console.log('Бот запущен в режиме polling');
    }
    
    // Graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (error) {
    console.error('Ошибка при запуске бота:', error);
    process.exit(1);
  }
};

startBot();


