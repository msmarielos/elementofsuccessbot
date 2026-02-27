import { Telegraf } from 'telegraf';
import { InlineKeyboardMarkup } from 'telegraf/types';
import { PaymentService, VerifiedPaymentState } from './paymentService';
import { SubscriptionService } from './subscriptionService';

export class PaymentCompletionService {
  private channelId: string;
  private inviteLinkExpireHours: number;
  private isProduction: boolean;

  constructor(
    private bot: Telegraf,
    private paymentService: PaymentService,
    private subscriptionService: SubscriptionService
  ) {
    this.channelId = process.env.PRIVATE_CHANNEL_ID || '';
    this.inviteLinkExpireHours = parseInt(process.env.INVITE_LINK_EXPIRE_HOURS || '12', 10);
    this.isProduction = process.env.NODE_ENV === 'production';

    if (!this.channelId) {
      console.warn('⚠️ PRIVATE_CHANNEL_ID не установлен - пригласительные ссылки не будут создаваться');
    }
  }

  async completeIfPaid(paymentId: string): Promise<{
    success: boolean;
    state?: VerifiedPaymentState;
    message?: string;
  }> {
    const record = this.paymentService.getPaymentRecord(paymentId);
    if (!record) {
      return { success: false, message: 'Платеж не найден в базе (PaymentId неизвестен)' };
    }

    if (record.subscriptionActivated) {
      return { success: true, message: 'Подписка уже активирована (идемпотентно)' };
    }

    const state = await this.paymentService.verifyPaymentByRecord(record);

    if (!state.isPaid) {
      return { success: false, state, message: `Платеж не подтвержден (status=${state.status || 'unknown'})` };
    }

    // Активируем подписку (идемпотентность обеспечиваем через payments DB + subscriptionService)
    const subscription = this.subscriptionService.activateSubscription(record.userId, record.planId, paymentId);
    this.paymentService.markPaymentActivated(paymentId);

    const plan = this.subscriptionService.getPlanById(record.planId);
    const endDate = subscription.endDate.toLocaleDateString('ru-RU');

    const inviteLink = await this.createInviteLink(record.userId);

    let message =
      `✅ Платеж подтвержден!\n\n` +
      `📋 Подписка "${plan?.name || record.planId}" активирована.\n` +
      `📅 Действует до: ${endDate}\n\n`;

    if (inviteLink) {
      message +=
        `🔗 Ваша персональная ссылка для входа в закрытый канал:\n\n` +
        `${inviteLink}\n\n` +
        `⚠️ Внимание: ссылка одноразовая и действует ${this.inviteLinkExpireHours} часов!\n` +
        `Перейдите по ней прямо сейчас.\n\n`;
    }

    message += `Спасибо за покупку! 🎉`;

    await this.bot.telegram.sendMessage(record.userId, message);

    return { success: true, state, message: 'Подписка активирована' };
  }

  async replyCheckResultToChat(chatId: number, paymentId: string): Promise<void> {
    const record = this.paymentService.getPaymentRecord(paymentId);
    if (!record) {
      await this.bot.telegram.sendMessage(chatId, '❌ Платеж не найден. Попробуйте создать новую ссылку на оплату.');
      return;
    }

    const state = await this.paymentService.verifyPaymentByRecord(record);
    if (state.isPaid) {
      const result = await this.completeIfPaid(paymentId);
      if (result.success) return;
      await this.bot.telegram.sendMessage(chatId, '⚠️ Платеж подтвержден, но не удалось активировать подписку. Напишите в поддержку.');
      return;
    }

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          {
            text: '🔄 Проверить еще раз',
            callback_data: `check_payment_${record.planId}_${paymentId}`,
          },
        ],
      ],
    };

    await this.bot.telegram.sendMessage(
      chatId,
      `⏳ Платеж пока не подтвержден.\n\n` +
        `Статус: ${state.status || 'неизвестно'}\n` +
        `Если вы уже оплатили — подождите 1–2 минуты и нажмите “Проверить еще раз”.`,
      { reply_markup: keyboard }
    );
  }

  private async createInviteLink(userId: number): Promise<string | null> {
    if (!this.channelId) return null;

    try {
      const expireHours = Math.max(this.inviteLinkExpireHours, 12);
      const expireDate = Math.floor(Date.now() / 1000) + expireHours * 60 * 60;

      const inviteLink = await this.bot.telegram.createChatInviteLink(this.channelId, {
        member_limit: 1,
        expire_date: expireDate,
        name: `User ${userId} - ${new Date().toISOString()}`,
      });

      if (!this.isProduction) {
        console.log(`✅ Invite link for ${userId}:`, inviteLink.invite_link);
      }

      return inviteLink.invite_link;
    } catch (error) {
      console.error('❌ Ошибка создания пригласительной ссылки:', error);
      return null;
    }
  }
}


