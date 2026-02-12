import { UserSubscription, SubscriptionPlan, SUBSCRIPTION_PLANS } from '../types/subscription';
import { SubscriptionDatabase } from './subscriptionDatabase';

export class SubscriptionService {
  private subscriptions: Map<number, UserSubscription>;
  private db: SubscriptionDatabase;

  constructor() {
    this.db = new SubscriptionDatabase();
    this.subscriptions = this.db.loadSubscriptions();
    console.log(`🗄️ Subscriptions DB path: ${this.db.getFilePath()}`);
    console.log(`🗄️ Loaded subscriptions: ${this.subscriptions.size}`);
  }

  /**
   * Получить все доступные планы подписки
   */
  getAvailablePlans(): SubscriptionPlan[] {
    return SUBSCRIPTION_PLANS;
  }

  /**
   * Получить план по ID
   */
  getPlanById(planId: string): SubscriptionPlan | undefined {
    return SUBSCRIPTION_PLANS.find(plan => plan.id === planId);
  }

  /**
   * Получить активную подписку пользователя
   */
  getUserSubscription(userId: number): UserSubscription | undefined {
    const subscription = this.subscriptions.get(userId);
    
    if (subscription && subscription.isActive) {
      // Проверяем, не истекла ли подписка
      if (new Date() > subscription.endDate) {
        return undefined;
      }
      return subscription;
    }
    
    return undefined;
  }

  /**
   * Активировать подписку для пользователя
   */
  activateSubscription(
    userId: number,
    planId: string,
    paymentId?: string
  ): UserSubscription {
    const plan = this.getPlanById(planId);
    
    if (!plan) {
      throw new Error(`План подписки ${planId} не найден`);
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.duration);

    const subscription: UserSubscription = {
      userId,
      planId,
      startDate,
      endDate,
      isActive: true,
      paymentId,
      reminder3DaysSent: false,
      reminder12HoursSent: false,
      expiryDayNoticeSent: false,
      expiredMessageSent: false,
      removedFromPrivateGroup: false,
      expiredProcessed: false,
    };

    this.subscriptions.set(userId, subscription);
    this.persist();
    return subscription;
  }

  /**
   * Проверить, есть ли у пользователя активная подписка
   */
  hasActiveSubscription(userId: number): boolean {
    const subscription = this.getUserSubscription(userId);
    return subscription !== undefined;
  }

  /**
   * Получить информацию о подписке пользователя в текстовом виде
   */
  getSubscriptionInfo(userId: number): string {
    const subscription = this.getUserSubscription(userId);
    
    if (!subscription) {
      return 'У вас нет активной подписки.';
    }

    const plan = this.getPlanById(subscription.planId);
    const endDate = subscription.endDate.toLocaleDateString('ru-RU');
    
    return `📋 Ваша подписка: ${plan?.name || subscription.planId}\n` +
           `📅 Действует до: ${endDate}\n` +
           `✅ Статус: Активна`;
  }

  getAllSubscriptions(): UserSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  updateSubscription(userId: number, patch: Partial<UserSubscription>): UserSubscription | undefined {
    const current = this.subscriptions.get(userId);
    if (!current) return undefined;

    const updated: UserSubscription = {
      ...current,
      ...patch,
      userId: current.userId,
    };

    this.subscriptions.set(userId, updated);
    this.persist();
    return updated;
  }

  deactivateSubscription(userId: number): void {
    const current = this.subscriptions.get(userId);
    if (!current) return;
    if (!current.isActive) return;

    this.subscriptions.set(userId, { ...current, isActive: false });
    this.persist();
  }

  private persist(): void {
    this.db.saveSubscriptions(this.subscriptions);
  }
}





