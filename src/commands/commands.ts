import { Telegraf, Context } from 'telegraf';
import { SubscriptionService } from '../services/subscriptionService';
import { PaymentService } from '../services/paymentService';
import { InlineKeyboardMarkup } from 'telegraf/types';

import { BotHandlers } from '../handlers/handlers';

export class BotCommands {
  constructor(
    private bot: Telegraf,
    private subscriptionService: SubscriptionService,
    private paymentService: PaymentService,
    private handlers?: BotHandlers
  ) {}

  registerCommands() {
    // Команда /start с поддержкой deep link параметров
    this.bot.command('start', async (ctx: Context) => {
      const userId = ctx.from?.id;
      if (userId && this.handlers) {
        // Отмечаем, что приветствие показано
        (this.handlers as any).markWelcomeShown(userId);
      }

      // Проверяем deep link параметр (после /start)
      const message = ctx.message as any;
      const startPayload = message?.text?.split(' ')[1] || '';

      // Обработка возврата после оплаты
      if (startPayload === 'payment_success' || startPayload.startsWith('payment_success_')) {
        const paymentId = startPayload.startsWith('payment_success_')
          ? startPayload.replace('payment_success_', '')
          : undefined;
        await this.handlePaymentReturn(ctx, true, paymentId);
        return;
      }
      if (startPayload === 'payment_fail') {
        await this.handlePaymentReturn(ctx, false);
        return;
      }

      await this.showWelcomeMessage(ctx);
    });

    // Команда /help
    this.bot.command('help', async (ctx: Context) => {
      const helpMessage = `Привет! вижу у тебя есть вопрос 🫂\nнапиши нашей команде, и мы все решим – @sokolova_chem\n\n❓Мне не пришел файл/ссылки на канал\n\n💌 Обычно боту надо 3-5 минут для отправки ссылок и файлов, в редких случаях 10-15 минут, если после этого времени ссылок так и не пришло, то смело пиши нам, мы решим этот вопрос.`;

      await ctx.reply(helpMessage);
    });

    // Команда /plans - показать доступные планы
    this.bot.command('plans', async (ctx: Context) => {
      await this.showPlans(ctx);
    });

    // Команда /my_subscription - показать текущую подписку
    this.bot.command('my_subscription', async (ctx: Context) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      const subscriptionInfo = this.subscriptionService.getSubscriptionInfo(userId);
      await ctx.reply(subscriptionInfo);
    });

    // Команда /buy - купить подписку
    this.bot.command('buy', async (ctx: Context) => {
      await this.showPlans(ctx, true);
    });
  }

  private async showPlans(ctx: Context, isBuying: boolean = false) {
    const plans = this.subscriptionService.getAvailablePlans();
    
    let message = isBuying 
      ? '💰 Выберите тарифный план:\n\n'
      : '📋 Доступные тарифы:\n\n';

    plans.forEach((plan, index) => {
      message += `${index + 1}. ${plan.name} - ${plan.price}₽\n`;
      message += `   ${plan.description}\n`;
      if (plan.features.length > 0) {
        message += `   Включено:\n`;
        plan.features.forEach(feature => {
          message += `   • ${feature}\n`;
        });
      }
      message += `\n`;
    });

    if (isBuying) {
      const keyboard: InlineKeyboardMarkup = {
        inline_keyboard: plans.map(plan => [
          {
            text: `${plan.name} - ${plan.price}₽`,
            callback_data: `buy_${plan.id}`
          }
        ])
      };

      await ctx.reply(message, { reply_markup: keyboard });
    } else {
      const keyboard: InlineKeyboardMarkup = {
        inline_keyboard: [
          [
            {
              text: 'ОФОРМИТЬ ПОДПИСКУ',
              callback_data: 'show_buy_options'
            }
          ]
        ]
      };

      await ctx.reply(message, { reply_markup: keyboard });
    }
  }

  async showWelcomeMessage(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const welcomeMessage = `Этот бот помогает погрузиться в изучение химии ✨\nЖми Старт/Start , чтобы начать общение 🧡`;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          {
            text: 'Старт / Start',
            callback_data: 'start_command'
          }
        ]
      ]
    };

    await ctx.reply(welcomeMessage, { reply_markup: keyboard });
  }

  // Обработка возврата после оплаты
  private async handlePaymentReturn(ctx: Context, success: boolean, paymentId?: string) {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (success) {
      // Проверяем статус подписки
      const hasSubscription = this.subscriptionService.hasActiveSubscription(userId);
      
      if (hasSubscription) {
        const subscriptionInfo = this.subscriptionService.getSubscriptionInfo(userId);
        await ctx.reply(
          `🎉 Добро пожаловать!\n\n` +
          `${subscriptionInfo}\n\n` +
          `Спасибо за покупку! Теперь у вас есть доступ ко всем материалам.`
        );
      } else {
        // Подписка ещё не активирована (webhook мог не прийти)
        await ctx.reply(
          `✅ Оплата получена!\n\n` +
          `Ваша подписка активируется в течение нескольких минут.\n` +
          `Если через 5 минут подписка не появится, напишите в поддержку.` +
          (paymentId ? `\n\nID платежа: ${paymentId}` : '')
        );
      }
    } else {
      await ctx.reply(
        `❌ Оплата не прошла\n\n` +
        `Попробуйте ещё раз или обратитесь в поддержку, если проблема повторяется.`
      );
      
      // Показываем кнопку для повторной попытки
      const keyboard: InlineKeyboardMarkup = {
        inline_keyboard: [
          [
            {
              text: '🔄 Попробовать снова',
              callback_data: 'show_buy_options'
            }
          ]
        ]
      };
      
      await ctx.reply('Выберите действие:', { reply_markup: keyboard });
    }
  }
}


