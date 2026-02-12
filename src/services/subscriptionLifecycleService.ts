import { Telegraf } from 'telegraf';
import { InlineKeyboardMarkup } from 'telegraf/types';
import { SubscriptionService } from './subscriptionService';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export class SubscriptionLifecycleService {
  private channelId: string;
  private timer: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;
  private isRunning = false;

  constructor(
    private bot: Telegraf,
    private subscriptionService: SubscriptionService
  ) {
    this.channelId = process.env.PRIVATE_CHANNEL_ID || '';
    this.intervalMs = parseInt(process.env.SUBSCRIPTION_CHECK_INTERVAL_MS || '300000', 10);
  }

  start(): void {
    if (this.timer) return;

    void this.runCycle();
    this.timer = setInterval(() => {
      void this.runCycle();
    }, this.intervalMs);

    console.log(`🕒 Subscription lifecycle job started (interval: ${this.intervalMs}ms)`);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async runCycle(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const now = new Date();
      const all = this.subscriptionService.getAllSubscriptions();

      for (const subscription of all) {
        if (subscription.expiredProcessed) {
          continue;
        }

        const msLeft = subscription.endDate.getTime() - now.getTime();
        const plan = this.subscriptionService.getPlanById(subscription.planId);

        if (subscription.isActive && !subscription.reminder3DaysSent && msLeft <= THREE_DAYS_MS && msLeft > TWELVE_HOURS_MS) {
          const sent = await this.sendReminder3Days(subscription.userId, subscription.endDate, plan?.name || subscription.planId);
          if (sent) {
            this.subscriptionService.updateSubscription(subscription.userId, { reminder3DaysSent: true });
          }
        }

        if (subscription.isActive && !subscription.reminder12HoursSent && msLeft <= TWELVE_HOURS_MS && msLeft > 0) {
          const sent = await this.sendReminder12Hours(subscription.userId, subscription.endDate, plan?.name || subscription.planId);
          if (sent) {
            this.subscriptionService.updateSubscription(subscription.userId, { reminder12HoursSent: true });
          }
        }

        if (subscription.isActive && !subscription.expiryDayNoticeSent && this.isSameDate(now, subscription.endDate) && msLeft > 0) {
          const sent = await this.sendExpiryDayReminder(subscription.userId, subscription.endDate, plan?.name || subscription.planId);
          if (sent) {
            this.subscriptionService.updateSubscription(subscription.userId, { expiryDayNoticeSent: true });
          }
        }

        if (msLeft <= 0) {
          await this.processExpiration(subscription.userId);
        }
      }
    } catch (error) {
      console.error('❌ Ошибка lifecycle job подписок:', error);
    } finally {
      this.isRunning = false;
    }
  }

  private async processExpiration(userId: number): Promise<void> {
    const subscription = this.subscriptionService.getAllSubscriptions().find((s) => s.userId === userId);
    if (!subscription || subscription.expiredProcessed) return;

    const plan = this.subscriptionService.getPlanById(subscription.planId);

    if (!subscription.expiredMessageSent) {
      const sent = await this.sendExpiredMessage(userId, plan?.name || subscription.planId);
      if (sent) {
        this.subscriptionService.updateSubscription(userId, { expiredMessageSent: true });
      }
    }

    let removedFromPrivateGroup = subscription.removedFromPrivateGroup ?? false;
    if (!removedFromPrivateGroup) {
      removedFromPrivateGroup = await this.removeFromPrivateGroup(userId);
    }

    this.subscriptionService.updateSubscription(userId, {
      isActive: false,
      removedFromPrivateGroup: removedFromPrivateGroup,
      expiredProcessed: removedFromPrivateGroup || !this.channelId,
      expiryDayNoticeSent: true,
      reminder3DaysSent: true,
      reminder12HoursSent: true,
    });
  }

  private async removeFromPrivateGroup(userId: number): Promise<boolean> {
    if (!this.channelId) {
      console.warn('⚠️ PRIVATE_CHANNEL_ID не задан, удаление из группы пропущено');
      return false;
    }

    try {
      const untilDate = Math.floor(Date.now() / 1000) + 60;
      await this.bot.telegram.banChatMember(this.channelId, userId, untilDate);
      await this.bot.telegram.unbanChatMember(this.channelId, userId, { only_if_banned: true });
      console.log(`🚫 Пользователь ${userId} удален из приватной группы/канала`);
      return true;
    } catch (error: any) {
      // Считаем "пользователь не найден/не участник" как успешно обработанный кейс.
      const description = error?.response?.description || error?.description || error?.message || '';
      const normalizedDescription = typeof description === 'string' ? description.toLowerCase() : '';
      if (
        normalizedDescription.includes('user not found') ||
        normalizedDescription.includes('participant_id_invalid') ||
        normalizedDescription.includes('user not participant')
      ) {
        console.log(`ℹ️ Пользователь ${userId} уже не состоит в приватной группе`);
        return true;
      }

      console.error(`❌ Не удалось удалить пользователя ${userId} из приватной группы:`, error);
      return false;
    }
  }

  private async sendReminder3Days(userId: number, endDate: Date, planName: string): Promise<boolean> {
    const endDateFormatted = endDate.toLocaleDateString('ru-RU');
    const message = `⏳ Напоминание о подписке\n\n` +
      `Ваша подписка "${planName}" закончится через 3 дня (${endDateFormatted}).\n` +
      `Чтобы не потерять доступ к материалам, продлите подписку заранее.`;
    return this.sendMessageWithRenewButton(userId, message);
  }

  private async sendReminder12Hours(userId: number, endDate: Date, planName: string): Promise<boolean> {
    const endDateFormatted = endDate.toLocaleDateString('ru-RU');
    const message = `⏰ Важно: подписка скоро закончится\n\n` +
      `До окончания подписки "${planName}" осталось около 12 часов.\n` +
      `Дата окончания: ${endDateFormatted}.\n\n` +
      `Продлите подписку, чтобы сохранить доступ к закрытым материалам.`;
    return this.sendMessageWithRenewButton(userId, message);
  }

  private async sendExpiryDayReminder(userId: number, endDate: Date, planName: string): Promise<boolean> {
    const endDateFormatted = endDate.toLocaleDateString('ru-RU');
    const message = `📅 Подписка заканчивается сегодня\n\n` +
      `Сегодня последний день действия подписки "${planName}" (${endDateFormatted}).\n` +
      `Если хотите продолжить обучение без перерыва, продлите подписку сейчас.`;
    return this.sendMessageWithRenewButton(userId, message);
  }

  private async sendExpiredMessage(userId: number, planName: string): Promise<boolean> {
    const message = `❌ Подписка завершена\n\n` +
      `Подписка "${planName}" истекла, доступ к приватной группе закрыт.\n` +
      `Чтобы снова получить доступ к материалам, оформите продление.`;
    return this.sendMessageWithRenewButton(userId, message);
  }

  private async sendMessageWithRenewButton(userId: number, message: string): Promise<boolean> {
    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          {
            text: 'Продлить подписку',
            callback_data: 'show_buy_options',
          },
        ],
      ],
    };

    try {
      await this.bot.telegram.sendMessage(userId, message, { reply_markup: keyboard });
      return true;
    } catch (error) {
      console.error(`❌ Не удалось отправить уведомление пользователю ${userId}:`, error);
      return false;
    }
  }

  private isSameDate(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }
}

