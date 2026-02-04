import { Telegraf } from 'telegraf';
import { PaymentService } from '../services/paymentService';
import { SubscriptionService } from '../services/subscriptionService';

/**
 * Обработчик webhook от платежной системы
 * Используйте этот класс для обработки уведомлений о платежах
 */
export class PaymentWebhookHandler {
  constructor(
    private bot: Telegraf,
    private paymentService: PaymentService,
    private subscriptionService: SubscriptionService
  ) {}

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

        // Отправляем уведомление пользователю
        const plan = this.subscriptionService.getPlanById(result.planId);
        const endDate = subscription.endDate.toLocaleDateString('ru-RU');

        await this.bot.telegram.sendMessage(
          result.userId,
          `✅ Платеж успешно обработан!\n\n` +
          `📋 Ваша подписка "${plan?.name || result.planId}" активирована.\n` +
          `📅 Действует до: ${endDate}\n\n` +
          `Спасибо за покупку!`
        );

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



