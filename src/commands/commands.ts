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
    // Команда /start
    this.bot.command('start', async (ctx: Context) => {
      const userId = ctx.from?.id;
      if (userId && this.handlers) {
        // Отмечаем, что приветствие показано
        (this.handlers as any).markWelcomeShown(userId);
      }
      await this.showWelcomeMessage(ctx);
    });

    // Команда /help
    this.bot.command('help', async (ctx: Context) => {
      const helpMessage = `
📖 Справка по боту:

/start - Начать работу с ботом
/plans - Посмотреть доступные тарифы подписки
/my_subscription - Проверить статус вашей подписки
/buy - Купить подписку

Если у вас возникли вопросы, обратитесь в поддержку.
      `.trim();

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
}


