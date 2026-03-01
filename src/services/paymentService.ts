import { SubscriptionPlan } from '../types/subscription';
import axios from 'axios';
import crypto from 'crypto';
import { PaymentDatabase, StoredPayment } from './paymentDatabase';

type TBankInitResponse = {
  Success: boolean;
  ErrorCode?: string;
  Message?: string;
  Details?: string;
  TerminalKey?: string;
  Status?: string;
  PaymentId?: string | number;
  OrderId?: string;
  PaymentURL?: string;
  Amount?: number;
};

type TBankGetStateResponse = {
  Success: boolean;
  ErrorCode?: string;
  Message?: string;
  Details?: string;
  TerminalKey?: string;
  Status?: string;
  PaymentId?: string | number;
  OrderId?: string;
  Amount?: number;
};

export type VerifiedPaymentState = {
  isPaid: boolean;
  status?: string;
  amountKopeks?: number;
};

function decodeEnvValue(value: string): string {
  // Amvera UI may force special characters to be URL-encoded.
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export class PaymentService {
  private terminalKey: string;
  private password: string;
  private apiBaseUrl: string;
  private successUrl: string;
  private failUrl: string;
  private isProduction: boolean;
  private db: PaymentDatabase;

  constructor() {
    this.terminalKey = process.env.TBANK_TERMINAL_KEY || '';
    this.password = decodeEnvValue(process.env.TBANK_PASSWORD || '');
    this.apiBaseUrl = (process.env.TBANK_API_BASE_URL || 'https://securepay.tinkoff.ru/v2').replace(/\/+$/, '');
    this.isProduction = process.env.NODE_ENV === 'production';
    this.db = new PaymentDatabase();

    // URLs возврата после оплаты (SuccessURL/FailURL по статье)
    const publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    this.successUrl = process.env.TBANK_SUCCESS_URL || (publicBaseUrl ? `${publicBaseUrl}/payment/success` : '');
    // Явно отключаем FailURL: при неуспешной оплате пользователь остается в платежной форме и может повторить попытку.
    this.failUrl = '';

    if (!this.terminalKey) console.warn('⚠️ TBANK_TERMINAL_KEY не установлен в переменных окружения');
    if (!this.password) console.warn('⚠️ TBANK_PASSWORD не установлен в переменных окружения');
    if (!this.successUrl) {
      console.warn('⚠️ Не задан SuccessURL возврата. Укажите PUBLIC_BASE_URL или TBANK_SUCCESS_URL');
    }
    if (process.env.TBANK_FAIL_URL) {
      console.warn('⚠️ TBANK_FAIL_URL задан, но игнорируется (FailURL отключен по бизнес-логике).');
    }

    console.log(`🗄️ Payments DB path: ${this.db.getFilePath()}`);
  }

  /**
   * Инициировать платеж в T‑Bank и получить PaymentURL
   * По сценарию из статьи: Init → PaymentURL → открыть ссылку в WebView/браузере.
   */
  async createPaymentLink(
    userId: number,
    plan: SubscriptionPlan,
    chatId: number
  ): Promise<{ paymentUrl: string; paymentId: string; orderId: string }> {
    if (!this.terminalKey || !this.password) {
      throw new Error('TBANK_TERMINAL_KEY/TBANK_PASSWORD должны быть установлены');
    }
    if (!this.successUrl) {
      throw new Error('PUBLIC_BASE_URL или TBANK_SUCCESS_URL должны быть установлены');
    }

    const orderId = `${userId}_${plan.id}_${Date.now()}`;
    const amountKopeks = Math.round(plan.price * 100);

    const body: Record<string, any> = {
      TerminalKey: this.terminalKey,
      Amount: amountKopeks,
      OrderId: orderId,
      Description: `Подписка "${plan.name}" - Элемент успеха`,
      SuccessURL: this.successUrl,
    };

    const token = this.createToken({ ...body, Password: this.password });
    const requestBody = { ...body, Token: token };

    try {
      const response = await axios.post<TBankInitResponse>(`${this.apiBaseUrl}/Init`, requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });

      const data = response.data;
      if (data?.Success && data.PaymentURL && data.PaymentId !== undefined) {
        const paymentId = String(data.PaymentId);

        const record: StoredPayment = {
          paymentId,
          orderId,
          userId,
          chatId,
          planId: plan.id,
          amountKopeks,
          currency: plan.currency,
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          subscriptionActivated: false,
        };
        this.db.upsert(record);

        console.log('✅ Создана платежная ссылка T‑Bank:', data.PaymentURL, 'PaymentId=', paymentId);
        return { paymentUrl: data.PaymentURL, paymentId, orderId };
      }

      console.error('❌ Ошибка Init T‑Bank:', data);
      throw new Error(data?.Message || data?.Details || 'Ошибка инициирования платежа T‑Bank');
    } catch (error: any) {
      if (this.isProduction) {
        console.error('❌ Ошибка Init T‑Bank:', error.message);
      } else {
        console.error('❌ Ошибка Init T‑Bank:', error.response?.data || error.message);
      }
      throw error;
    }
  }

  getPaymentRecord(paymentId: string): StoredPayment | undefined {
    return this.db.get(paymentId);
  }

  markPaymentActivated(paymentId: string): void {
    this.db.markActivated(paymentId);
  }

  /**
   * Получить статус платежа (GetState).
   * По статье: после успешного/неуспешного сценария нужно дополнительно вызвать метод получения статуса.
   */
  async getPaymentState(paymentId: string): Promise<TBankGetStateResponse> {
    if (!this.terminalKey || !this.password) {
      throw new Error('TBANK_TERMINAL_KEY/TBANK_PASSWORD должны быть установлены');
    }

    const body: Record<string, any> = {
      TerminalKey: this.terminalKey,
      PaymentId: paymentId,
    };
    const token = this.createToken({ ...body, Password: this.password });
    const requestBody = { ...body, Token: token };

    const response = await axios.post<TBankGetStateResponse>(`${this.apiBaseUrl}/GetState`, requestBody, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    return response.data;
  }

  async verifyPaymentByRecord(record: StoredPayment): Promise<VerifiedPaymentState> {
    try {
      const state = await this.getPaymentState(record.paymentId);

      if (!state?.Success) {
        return { isPaid: false, status: state?.Status, amountKopeks: state?.Amount };
      }

      const status = state.Status || '';
      const amount = typeof state.Amount === 'number' ? state.Amount : undefined;

      // Одностадийный: CONFIRMED
      // Двухстадийный: AUTHORIZED (после оплаты) → CONFIRMED (после Confirm)
      const paidByStatus = status === 'CONFIRMED' || status === 'AUTHORIZED';
      const amountMatches = amount === undefined ? true : amount === record.amountKopeks;

      if (paidByStatus && amountMatches) {
        this.db.updateStatus(record.paymentId, 'confirmed');
        return { isPaid: true, status, amountKopeks: amount };
      }

      return { isPaid: false, status, amountKopeks: amount };
    } catch (error) {
      console.error('❌ Ошибка verifyPaymentByRecord:', error);
      return { isPaid: false };
    }
  }

  /**
   * Формирование Token для запросов T‑Bank (подпись).
   * Реализовано по классическому правилу e-acquiring: сортировка ключей и SHA-256 по конкатенации значений + Password.
   */
  private createToken(fields: Record<string, any>): string {
    const normalized: Record<string, string> = {};
    Object.keys(fields).forEach((key) => {
      if (fields[key] === undefined || fields[key] === null) return;
      // В Token-схеме T‑Bank обычно участвуют строковые значения. Объекты/массивы не используем.
      normalized[key] = String(fields[key]);
    });

    const keys = Object.keys(normalized).sort();
    const concatenated = keys.map((k) => normalized[k]).join('');
    return crypto.createHash('sha256').update(concatenated).digest('hex');
  }
}


