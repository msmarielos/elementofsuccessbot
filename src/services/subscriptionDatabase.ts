import fs from 'fs';
import path from 'path';
import { UserSubscription } from '../types/subscription';

interface StoredSubscription {
  userId: number;
  planId: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  paymentId?: string;
  reminder3DaysSent?: boolean;
  reminder12HoursSent?: boolean;
  expiryDayNoticeSent?: boolean;
  expiredMessageSent?: boolean;
  removedFromPrivateGroup?: boolean;
  expiredProcessed?: boolean;
}

interface StoredData {
  subscriptions: StoredSubscription[];
}

export class SubscriptionDatabase {
  private readonly dbFilePath: string;

  constructor() {
    const configuredPath = process.env.SUBSCRIPTIONS_DB_PATH || path.join('data', 'subscriptions.json');
    this.dbFilePath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(process.cwd(), configuredPath);

    this.ensureDbFile();
  }

  loadSubscriptions(): Map<number, UserSubscription> {
    const raw = this.readData();
    const subscriptions = new Map<number, UserSubscription>();

    raw.subscriptions.forEach((item) => {
      subscriptions.set(item.userId, {
        userId: item.userId,
        planId: item.planId,
        startDate: new Date(item.startDate),
        endDate: new Date(item.endDate),
        isActive: item.isActive,
        paymentId: item.paymentId,
        reminder3DaysSent: item.reminder3DaysSent ?? false,
        reminder12HoursSent: item.reminder12HoursSent ?? false,
        expiryDayNoticeSent: item.expiryDayNoticeSent ?? false,
        expiredMessageSent: item.expiredMessageSent ?? false,
        removedFromPrivateGroup: item.removedFromPrivateGroup ?? false,
        expiredProcessed: item.expiredProcessed ?? false,
      });
    });

    return subscriptions;
  }

  saveSubscriptions(subscriptions: Map<number, UserSubscription>): void {
    const serialized: StoredData = {
      subscriptions: Array.from(subscriptions.values()).map((item) => ({
        userId: item.userId,
        planId: item.planId,
        startDate: item.startDate.toISOString(),
        endDate: item.endDate.toISOString(),
        isActive: item.isActive,
        paymentId: item.paymentId,
        reminder3DaysSent: item.reminder3DaysSent ?? false,
        reminder12HoursSent: item.reminder12HoursSent ?? false,
        expiryDayNoticeSent: item.expiryDayNoticeSent ?? false,
        expiredMessageSent: item.expiredMessageSent ?? false,
        removedFromPrivateGroup: item.removedFromPrivateGroup ?? false,
        expiredProcessed: item.expiredProcessed ?? false,
      })),
    };

    fs.writeFileSync(this.dbFilePath, JSON.stringify(serialized, null, 2), 'utf8');
  }

  private ensureDbFile(): void {
    const dir = path.dirname(this.dbFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.dbFilePath)) {
      const initialData: StoredData = { subscriptions: [] };
      fs.writeFileSync(this.dbFilePath, JSON.stringify(initialData, null, 2), 'utf8');
    }
  }

  private readData(): StoredData {
    try {
      const content = fs.readFileSync(this.dbFilePath, 'utf8').trim();
      if (!content) {
        return { subscriptions: [] };
      }

      const parsed = JSON.parse(content) as Partial<StoredData>;
      if (!Array.isArray(parsed.subscriptions)) {
        return { subscriptions: [] };
      }

      return { subscriptions: parsed.subscriptions as StoredSubscription[] };
    } catch (error) {
      console.error('❌ Ошибка чтения базы подписок, использую пустое состояние:', error);
      return { subscriptions: [] };
    }
  }
}

