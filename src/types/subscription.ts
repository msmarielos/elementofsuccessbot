export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  duration: number; // в днях
  features: string[];
}

export interface UserSubscription {
  userId: number;
  planId: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  paymentId?: string;
  reminder3DaysSent?: boolean;
  reminder12HoursSent?: boolean;
  expiryDayNoticeSent?: boolean;
  expiredMessageSent?: boolean;
  removedFromPrivateGroup?: boolean;
  expiredProcessed?: boolean;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  // ⚠️ ТЕСТОВЫЙ ПЛАН - удалить перед продакшеном!
  {
    id: 'test',
    name: '🧪 Тест (1₽)',
    description: 'Тестовая подписка',
    price: 1,
    currency: 'RUB',
    duration: 1, // 1 день
    features: [
      'Тестовая подписка',
      'Для проверки оплаты'
    ]
  },
  {
    id: '1_month',
    name: '1 месяц',
    description: 'Подписка на 1 месяц',
    price: 700,
    currency: 'RUB',
    duration: 30,
    features: [
      'Доступ ко всем материалам',
      'Домашние задания',
      'Ответы на вопросы',
      'Чат единомышленников'
    ]
  },
  {
    id: '3_months',
    name: '3 месяца',
    description: 'Подписка на 3 месяца',
    price: 1800,
    currency: 'RUB',
    duration: 90,
    features: [
      'Доступ ко всем материалам',
      'Домашние задания',
      'Ответы на вопросы',
      'Чат единомышленников',
      'Экономия 300₽'
    ]
  },
  {
    id: '6_months',
    name: '6 месяцев',
    description: 'Подписка на 6 месяцев',
    price: 3500,
    currency: 'RUB',
    duration: 180,
    features: [
      'Доступ ко всем материалам',
      'Домашние задания',
      'Ответы на вопросы',
      'Чат единомышленников',
      'Экономия 700₽'
    ]
  }
];


