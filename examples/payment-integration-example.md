# Примеры интеграции с платежными системами

## Интеграция с Stripe

### 1. Установка зависимостей
```bash
npm install stripe
```

### 2. Обновление PaymentService для Stripe

```typescript
import Stripe from 'stripe';

export class PaymentService {
  private stripe: Stripe;
  private paymentUrl: string;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',
    });
    this.paymentUrl = process.env.PAYMENT_URL || '';
  }

  async createPaymentLink(
    userId: number,
    plan: SubscriptionPlan,
    chatId: number
  ): Promise<string> {
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: plan.currency.toLowerCase(),
            product_data: {
              name: plan.name,
              description: plan.description,
            },
            unit_amount: plan.price * 100, // Stripe использует копейки/центы
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `https://t.me/${process.env.BOT_USERNAME}?start=payment_success`,
      cancel_url: `https://t.me/${process.env.BOT_USERNAME}?start=payment_cancel`,
      metadata: {
        user_id: userId.toString(),
        chat_id: chatId.toString(),
        plan_id: plan.id,
      },
    });

    return session.url!;
  }

  async verifyPayment(paymentId: string, userId: number, planId: string): Promise<boolean> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(paymentId);
      return session.payment_status === 'paid' && 
             session.metadata?.user_id === userId.toString() &&
             session.metadata?.plan_id === planId;
    } catch (error) {
      console.error('Ошибка при проверке платежа Stripe:', error);
      return false;
    }
  }

  async processPaymentNotification(data: any): Promise<{
    success: boolean;
    userId?: number;
    planId?: string;
    paymentId?: string;
  }> {
    const event = data;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      if (session.payment_status === 'paid') {
        return {
          success: true,
          userId: parseInt(session.metadata.user_id),
          planId: session.metadata.plan_id,
          paymentId: session.id,
        };
      }
    }

    return { success: false };
  }
}
```

### 3. Настройка webhook в Stripe Dashboard
1. Перейдите в Stripe Dashboard → Developers → Webhooks
2. Добавьте endpoint: `https://your-domain.com/webhook/payment`
3. Выберите события: `checkout.session.completed`
4. Скопируйте секретный ключ webhook в `.env` как `STRIPE_WEBHOOK_SECRET`

### 4. Обновление webhook handler для проверки подписи

```typescript
import Stripe from 'stripe';

app.post('/webhook/payment', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const sig = req.headers['stripe-signature'] as string;

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err}`);
  }

  const result = await webhookHandler.handlePaymentNotification(event);
  res.json({ received: true });
});
```

## Интеграция с ЮKassa (Яндекс.Касса)

### 1. Установка зависимостей
```bash
npm install @yandex-money/yandex-checkout-sdk
```

### 2. Обновление PaymentService для ЮKassa

```typescript
import { YooCheckout } from '@yandex-money/yandex-checkout-sdk';

export class PaymentService {
  private checkout: YooCheckout;
  private shopId: string;
  private secretKey: string;

  constructor() {
    this.shopId = process.env.YOOKASSA_SHOP_ID!;
    this.secretKey = process.env.YOOKASSA_SECRET_KEY!;
    this.checkout = new YooCheckout({
      shopId: this.shopId,
      secretKey: this.secretKey,
    });
  }

  async createPaymentLink(
    userId: number,
    plan: SubscriptionPlan,
    chatId: number
  ): Promise<string> {
    const payment = await this.checkout.createPayment({
      amount: {
        value: plan.price.toFixed(2),
        currency: plan.currency,
      },
      confirmation: {
        type: 'redirect',
        return_url: `https://t.me/${process.env.BOT_USERNAME}?start=payment_success`,
      },
      description: `Подписка ${plan.name}`,
      metadata: {
        user_id: userId.toString(),
        chat_id: chatId.toString(),
        plan_id: plan.id,
      },
    }, 'payment-id');

    return payment.confirmation.confirmation_url;
  }

  async verifyPayment(paymentId: string, userId: number, planId: string): Promise<boolean> {
    try {
      const payment = await this.checkout.getPayment(paymentId);
      return payment.status === 'succeeded' &&
             payment.metadata?.user_id === userId.toString() &&
             payment.metadata?.plan_id === planId;
    } catch (error) {
      console.error('Ошибка при проверке платежа ЮKassa:', error);
      return false;
    }
  }

  async processPaymentNotification(data: any): Promise<{
    success: boolean;
    userId?: number;
    planId?: string;
    paymentId?: string;
  }> {
    if (data.event === 'payment.succeeded') {
      const payment = data.object;
      
      return {
        success: true,
        userId: parseInt(payment.metadata.user_id),
        planId: payment.metadata.plan_id,
        paymentId: payment.id,
      };
    }

    return { success: false };
  }
}
```

## Интеграция с PayPal

### 1. Установка зависимостей
```bash
npm install @paypal/checkout-server-sdk
```

### 2. Обновление PaymentService для PayPal

```typescript
import paypal from '@paypal/checkout-server-sdk';

export class PaymentService {
  private client: paypal.core.PayPalHttpClient;

  constructor() {
    const environment = new paypal.core.SandboxEnvironment(
      process.env.PAYPAL_CLIENT_ID!,
      process.env.PAYPAL_CLIENT_SECRET!
    );
    this.client = new paypal.core.PayPalHttpClient(environment);
  }

  async createPaymentLink(
    userId: number,
    plan: SubscriptionPlan,
    chatId: number
  ): Promise<string> {
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: plan.currency,
          value: plan.price.toFixed(2),
        },
        description: `Подписка ${plan.name}`,
        custom_id: `${userId}_${plan.id}_${chatId}`,
      }],
      application_context: {
        return_url: `https://t.me/${process.env.BOT_USERNAME}?start=payment_success`,
        cancel_url: `https://t.me/${process.env.BOT_USERNAME}?start=payment_cancel`,
      },
    });

    const order = await this.client.execute(request);
    const approvalUrl = order.result.links.find(link => link.rel === 'approve')?.href;
    
    return approvalUrl || '';
  }

  async verifyPayment(paymentId: string, userId: number, planId: string): Promise<boolean> {
    try {
      const request = new paypal.orders.OrdersGetRequest(paymentId);
      const order = await this.client.execute(request);
      
      return order.result.status === 'COMPLETED';
    } catch (error) {
      console.error('Ошибка при проверке платежа PayPal:', error);
      return false;
    }
  }
}
```

## Общие рекомендации

1. **Безопасность**: Всегда проверяйте подпись webhook запросов
2. **Idempotency**: Обрабатывайте повторные уведомления о платежах
3. **Логирование**: Логируйте все платежные операции
4. **Обработка ошибок**: Реализуйте retry механизм для failed платежей
5. **Тестирование**: Используйте тестовые режимы платежных систем для разработки




