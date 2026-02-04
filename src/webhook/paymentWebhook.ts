import { Telegraf } from 'telegraf';
import { PaymentService } from '../services/paymentService';
import { SubscriptionService } from '../services/subscriptionService';

/**
 * Обработчик webhook от платежной системы
 * Используйте этот класс для обработки уведомлений о платежах
 */
export class PaymentWebhookHandler {
  private channelId: string;
  private inviteLinkExpireHours: number;

  constructor(
    private bot: Telegraf,
    private paymentService: PaymentService,
    private subscriptionService: SubscriptionService
  ) {
    // ID закрытого канала (начинается с -100 для супергрупп/каналов)
    this.channelId = process.env.PRIVATE_CHANNEL_ID || '';
    // Время жизни пригласительной ссылки в часах (по умолчанию 24 часа)
    this.inviteLinkExpireHours = parseInt(process.env.INVITE_LINK_EXPIRE_HOURS || '24', 10);
    
    if (!this.channelId) {
      console.warn('⚠️ PRIVATE_CHANNEL_ID не установлен - пригласительные ссылки не будут создаваться');
    }
  }

  /**
   * Создать одноразовую пригласительную ссылку на закрытый канал
   * @param userId - ID пользователя (для логирования)
   * @param subscriptionDays - срок подписки в днях
   */
  private async createInviteLink(userId: number, subscriptionDays: number): Promise<string | null> {
    if (!this.channelId) {
      console.error('PRIVATE_CHANNEL_ID не установлен');
      return null;
    }

    try {
      // Время истечения ссылки (в секундах Unix timestamp)
      // Даём время на вход: минимум 24 часа или срок подписки, что больше
      const expireHours = Math.max(this.inviteLinkExpireHours, 24);
      const expireDate = Math.floor(Date.now() / 1000) + (expireHours * 60 * 60);

      // Создаём одноразовую ссылку через Telegram API
      const inviteLink = await this.bot.telegram.createChatInviteLink(this.channelId, {
        member_limit: 1, // Только 1 человек может использовать ссылку
        expire_date: expireDate, // Срок действия ссылки
        name: `User ${userId} - ${new Date().toISOString()}`, // Имя ссылки для отслеживания
      });

      console.log(`✅ Создана пригласительная ссылка для пользователя ${userId}:`, inviteLink.invite_link);
      return inviteLink.invite_link;
    } catch (error) {
      console.error('❌ Ошибка создания пригласительной ссылки:', error);
      return null;
    }
  }

  /**
   * Обработать уведомление о платеже от платежной системы
   */
  async handlePaymentNotification(data: any): Promise<{
    success: boolean;
    message?: string;
  }> {
    try {
      const result = await this.paymentService.processPaymentNotification(data);

      if (result.success && result.userId && result.planId) {
        // Активируем подписку
        const subscription = this.subscriptionService.activateSubscription(
          result.userId,
          result.planId,
          result.paymentId
        );

        // Получаем информацию о плане
        const plan = this.subscriptionService.getPlanById(result.planId);
        const endDate = subscription.endDate.toLocaleDateString('ru-RU');

        // Создаём пригласительную ссылку на закрытый канал
        const inviteLink = await this.createInviteLink(result.userId, plan?.duration || 30);

        // Формируем сообщение
        let message = `✅ Платеж успешно обработан!\n\n` +
          `📋 Ваша подписка "${plan?.name || result.planId}" активирована.\n` +
          `📅 Действует до: ${endDate}\n\n`;

        if (inviteLink) {
          message += `🔗 Ваша персональная ссылка для входа в закрытый канал:\n\n` +
            `${inviteLink}\n\n` +
            `⚠️ Внимание: ссылка одноразовая и действует ${this.inviteLinkExpireHours} часов!\n` +
            `Перейдите по ней прямо сейчас.\n\n`;
        }

        message += `Спасибо за покупку! 🎉`;

        // Отправляем уведомление пользователю
        await this.bot.telegram.sendMessage(result.userId, message);

        return {
          success: true,
          message: 'Подписка успешно активирована'
        };
      }

      return {
        success: false,
        message: 'Платеж не обработан'
      };
    } catch (error) {
      console.error('Ошибка при обработке webhook платежа:', error);
      return {
        success: false,
        message: 'Ошибка при обработке платежа'
      };
    }
  }
}




