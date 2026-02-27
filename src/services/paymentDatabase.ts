import fs from 'fs';
import path from 'path';

export type PaymentStatus = 'pending' | 'confirmed' | 'failed';

export interface StoredPayment {
  paymentId: string;
  orderId: string;
  userId: number;
  chatId: number;
  planId: string;
  amountKopeks: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  subscriptionActivated: boolean;
  subscriptionActivatedAt?: string;
}

interface StoredData {
  payments: StoredPayment[];
}

/**
 * Простая JSON-БД для связки PaymentId → user/plan/amount.
 * Нужна, чтобы:
 * - проверять статус платежа после редиректа (SuccessURL/FailURL)
 * - делать идемпотентную активацию подписки
 */
export class PaymentDatabase {
  private readonly dbFilePath: string;

  constructor() {
    const configuredPath = process.env.PAYMENTS_DB_PATH || path.join('data', 'payments.json');
    this.dbFilePath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(process.cwd(), configuredPath);
    this.ensureDbFile();
  }

  getFilePath(): string {
    return this.dbFilePath;
  }

  upsert(payment: StoredPayment): void {
    const data = this.readData();
    const idx = data.payments.findIndex((p) => p.paymentId === payment.paymentId);
    if (idx >= 0) {
      data.payments[idx] = payment;
    } else {
      data.payments.push(payment);
    }
    fs.writeFileSync(this.dbFilePath, JSON.stringify(data, null, 2), 'utf8');
  }

  get(paymentId: string): StoredPayment | undefined {
    const data = this.readData();
    return data.payments.find((p) => p.paymentId === paymentId);
  }

  markActivated(paymentId: string): StoredPayment | undefined {
    const current = this.get(paymentId);
    if (!current) return undefined;
    if (current.subscriptionActivated) return current;

    const updated: StoredPayment = {
      ...current,
      subscriptionActivated: true,
      subscriptionActivatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.upsert(updated);
    return updated;
  }

  updateStatus(paymentId: string, status: PaymentStatus): StoredPayment | undefined {
    const current = this.get(paymentId);
    if (!current) return undefined;
    const updated: StoredPayment = {
      ...current,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.upsert(updated);
    return updated;
  }

  private ensureDbFile(): void {
    const dir = path.dirname(this.dbFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.dbFilePath)) {
      const initialData: StoredData = { payments: [] };
      fs.writeFileSync(this.dbFilePath, JSON.stringify(initialData, null, 2), 'utf8');
    }
  }

  private readData(): StoredData {
    try {
      const content = fs.readFileSync(this.dbFilePath, 'utf8').trim();
      if (!content) return { payments: [] };
      const parsed = JSON.parse(content) as Partial<StoredData>;
      if (!Array.isArray(parsed.payments)) return { payments: [] };
      return { payments: parsed.payments as StoredPayment[] };
    } catch (error) {
      console.error('❌ Ошибка чтения базы платежей, использую пустое состояние:', error);
      return { payments: [] };
    }
  }
}


