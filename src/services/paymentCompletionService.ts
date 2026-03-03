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

    message += 'Спасибо за покупку! 🎉';
    await this.bot.telegram.sendMessage(record.userId, message);

    return { success: true, state, message: 'Подписка активирована' };
  }

  async replyCheckResultToChat(
    chatId: number,
    paymentId: string,
    planId?: string,
    userId?: number
  ): Promise<void> {
    const record = this.paymentService.getPaymentRecord(paymentId);
    if (!record) {
      if (!planId || !userId) {
        await this.bot.telegram.sendMessage(chatId, '❌ Платеж не найден. Попробуйте создать новую ссылку на оплату.');
        return;
      }

      const plan = this.subscriptionService.getPlanById(planId);
      if (!plan) {
        await this.bot.telegram.sendMessage(chatId, '❌ Платеж не найден, и тариф тоже не найден. Выберите тариф заново.');
        return;
      }

      try {
        const { paymentUrl, paymentId: newPaymentId } = await this.paymentService.createPaymentLink(userId, plan, chatId);
        const retryKeyboard: InlineKeyboardMarkup = {
          inline_keyboard: [
            [{ text: '💳 Оплатить еще раз', url: paymentUrl }],
            [{ text: '✅ Проверить оплату', callback_data: `check_payment_${plan.id}_${newPaymentId}` }],
          ],
        };

        await this.bot.telegram.sendMessage(
          chatId,
          '❌ Платеж не найден. Мы создали новую ссылку на оплату:',
          { reply_markup: retryKeyboard }
        );
      } catch (error) {
        console.error('❌ Ошибка создания новой ссылки при неизвестном PaymentId:', error);
        await this.bot.telegram.sendMessage(chatId, '❌ Платеж не найден. Не удалось создать новую ссылку, попробуйте из меню подписок.');
      }
      return;
    }

    const state = await this.paymentService.verifyPaymentByRecord(record);
    if (state.isPaid) {
      const result = await this.completeIfPaid(paymentId);
      if (result.success) return;
      await this.bot.telegram.sendMessage(chatId, '⚠️ Платеж подтвержден, но не удалось активировать подписку. Напишите в поддержку.');
      return;
    }

    const status = (state.status || '').toUpperCase();
    const isFailedStatus = status === 'REJECTED' || status === 'CANCELED' || status === 'DEADLINE_EXPIRED';
    if (isFailedStatus) {
      this.paymentService.markPaymentFailed(paymentId);

      const plan = this.subscriptionService.getPlanById(record.planId);
      if (!plan) {
        await this.bot.telegram.sendMessage(
          chatId,
          `❌ Оплата не прошла (статус: ${status}).\n\nСоздайте новую оплату из меню подписок.`
        );
        return;
      }

      try {
        const { paymentUrl, paymentId: newPaymentId } = await this.paymentService.createPaymentLink(
          record.userId,
          plan,
          record.chatId
        );

        const retryKeyboard: InlineKeyboardMarkup = {
          inline_keyboard: [
            [{ text: '💳 Оплатить снова', url: paymentUrl }],
            [{ text: '✅ Проверить оплату', callback_data: `check_payment_${plan.id}_${newPaymentId}` }],
          ],
        };

        await this.bot.telegram.sendMessage(
          chatId,
          `❌ Оплата не прошла (статус: ${status}).\n\nМы создали новую ссылку, попробуйте снова:`,
          { reply_markup: retryKeyboard }
        );
        return;
      } catch (error) {
        console.error('❌ Ошибка создания новой ссылки после failed статуса:', error);
        await this.bot.telegram.sendMessage(
          chatId,
          `❌ Оплата не прошла (статус: ${status}).\n\nНе удалось автоматически создать новую ссылку, попробуйте еще раз через меню подписок.`
        );
        return;
      }
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
        'Если вы уже оплатили — подождите 1–2 минуты и нажмите “Проверить еще раз”.',
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


