import { Telegraf, Context } from 'telegraf';
import { SubscriptionService } from '../services/subscriptionService';
import { PaymentService } from '../services/paymentService';
import { InlineKeyboardMarkup } from 'telegraf/types';
import { PaymentCompletionService } from '../services/paymentCompletionService';

export class BotHandlers {
  private welcomeShown: Set<number> = new Set();
  private paymentCompletion: PaymentCompletionService;

  constructor(
    private bot: Telegraf,
    private subscriptionService: SubscriptionService,
    private paymentService: PaymentService
  ) {
    this.paymentCompletion = new PaymentCompletionService(bot, paymentService, subscriptionService);
  }

  // Метод для отметки, что приветствие показано (используется из BotCommands)
  markWelcomeShown(userId: number) {
    this.welcomeShown.add(userId);
  }

  registerHandlers() {
    // Обработчик callback_query (нажатия на кнопки)
    this.bot.on('callback_query', async (ctx: Context) => {
      if (!('data' in ctx.callbackQuery!)) return;
      
      const data = ctx.callbackQuery.data;
      const userId = ctx.from?.id;
      const chatId = ctx.chat?.id;

      if (!userId || !chatId) return;

      // Показать опции покупки
      if (data === 'show_buy_options') {
        await this.showBuyOptions(ctx);
        await ctx.answerCbQuery();
        return;
      }

      // Покупка подписки - сразу формируем ссылку на оплату
      if (data.startsWith('buy_')) {
        const planId = data.replace('buy_', '');
        await this.handlePurchase(ctx, planId);
        await ctx.answerCbQuery();
        return;
      }

      // Проверка платежа
      if (data.startsWith('check_payment_')) {
        const tail = data.replace('check_payment_', '');
        const parts = tail.split('_');
        // Новый формат: check_payment_{planId}_{paymentId}
        if (parts.length >= 2) {
          const paymentId = parts[parts.length - 1];
          const planId = parts.slice(0, -1).join('_');
          await this.checkPayment(ctx, planId, paymentId);
        } else {
          // legacy: check_payment_{planId}
          const planId = tail;
          await this.checkPayment(ctx, planId);
        }
        await ctx.answerCbQuery();
        return;
      }

      // Обработка кнопки Start
      if (data === 'start_command') {
        await this.handleStartCommand(ctx);
        await ctx.answerCbQuery();
        return;
      }

      await ctx.answerCbQuery();
    });

    // Обработчик текстовых сообщений
    this.bot.on('text', async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      const text = ctx.message.text.toLowerCase();
      
      // Проверяем, является ли это командой (начинается с /)
      const isCommand = ctx.message.text.startsWith('/');
      
      // Если это не команда и пользователь еще не видел приветствие, показываем его
      if (!isCommand && !this.welcomeShown.has(userId)) {
        await this.showWelcomeMessage(ctx);
        this.welcomeShown.add(userId);
        return;
      }
      
      // Обработка известных ключевых слов
      if (text === 'купить' || text === 'buy' || text === 'подписка') {
        await this.showBuyOptions(ctx);
      }
    });
  }

  private async showBuyOptions(ctx: Context) {
    const plans = this.subscriptionService.getAvailablePlans();
    
    const message = '💰 Выберите тарифный план:\n\n';
    
    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: plans.map(plan => [
        {
          text: `${plan.name} - ${plan.price}₽`,
          callback_data: `buy_${plan.id}`
        }
      ])
    };

    await ctx.reply(message, { reply_markup: keyboard });
  }

  private async handlePurchase(ctx: Context, planId: string) {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!userId || !chatId) return;

    const plan = this.subscriptionService.getPlanById(planId);
    
    if (!plan) {
      await ctx.reply('План подписки не найден.');
      return;
    }

    // Проверяем, есть ли уже активная подписка
    if (this.subscriptionService.hasActiveSubscription(userId)) {
      const subscriptionInfo = this.subscriptionService.getSubscriptionInfo(userId);
      await ctx.reply(
        `У вас уже есть активная подписка!\n\n${subscriptionInfo}\n\n` +
        `Если вы хотите продлить или изменить подписку, обратитесь в поддержку.`
      );
      return;
    }

    // Показываем сообщение о создании ссылки
    await ctx.reply('⏳ Создаю ссылку на оплату...');

    try {
      // Инициируем платеж в T‑Bank и получаем PaymentURL
      const { paymentUrl, paymentId } = await this.paymentService.createPaymentLink(userId, plan, chatId);

      const message = `
💳 Оплата подписки "${plan.name}"

📋 Тариф: ${plan.name}
💰 Сумма: ${plan.price}₽
📅 Срок действия: ${plan.duration} дней

Включено:
${plan.features.map(f => `• ${f}`).join('\n')}

Нажмите на кнопку ниже, чтобы перейти к оплате.
После успешной оплаты ваша подписка будет активирована автоматически.
      `.trim();

      const keyboard: InlineKeyboardMarkup = {
        inline_keyboard: [
          [
            {
              text: '💳 Перейти к оплате',
              url: paymentUrl
            }
          ],
          [
            {
              text: '✅ Проверить оплату',
              callback_data: `check_payment_${plan.id}_${paymentId}`,
            },
          ]
        ]
      };

      await ctx.reply(message, { reply_markup: keyboard });
    } catch (error) {
      console.error('Ошибка создания платежной ссылки:', error);
      await ctx.reply(
        '❌ Не удалось создать ссылку на оплату.\n\n' +
        'Пожалуйста, попробуйте позже или обратитесь в поддержку.'
      );
    }
  }

  // Метод для обработки проверки платежа (можно вызвать через callback или webhook)
  async checkPayment(ctx: Context, planId: string, paymentId?: string) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const plan = this.subscriptionService.getPlanById(planId);
    if (!plan) {
      await ctx.reply('План подписки не найден.');
      return;
    }

    if (!paymentId) {
      await ctx.reply('⚠️ Не знаю PaymentId для проверки. Создайте новую ссылку на оплату.');
      return;
    }

    await this.paymentCompletion.replyCheckResultToChat(ctx.chat!.id, paymentId, planId, userId);
  }

  private async handleStartCommand(ctx: Context) {
    const userId = ctx.from?.id;
    if (userId) {
      this.welcomeShown.add(userId);
    }

    const welcomeMessage = `
♥️ Мы — команда педагогов по химии «Элемент Успеха».

На нашем канале тебя ждет:
— регулярно новые темы для успешной сдачи ЕГЭ. Темы выстроены по порядку, так, чтобы тебе было удобно и понятно заниматься;
— домашнее задание под каждым теоретическим занятием, чтобы сразу можно было закрепить полученные знания;
— ответы на все задания. Если что-то непонятно - наши педагоги охотно ответят на твои вопросы, мы не кусаемся;
— при необходимости мы запланируем индивидуальную консультацию в удобное для тебя время для разъяснения вопросов.

💬 А еще: чат единомышленников, даже возможно твоих будущих однокурсников в ВУЗе.
Ты можешь проходить все в своем темпе, материалы остаются доступными, пока активна подписка.

📚 Стоимость подписки: 1 месяц — 700 ₽

Это дешевле, чем в любой онлайн-школе. К тому же, тебе отвечают не кураторы, а действующие педагоги со стажем от трех лет.

Скорее подписывайся!
    `.trim();

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

    await ctx.reply(welcomeMessage, { reply_markup: keyboard });
  }

  private async showWelcomeMessage(ctx: Context) {
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

