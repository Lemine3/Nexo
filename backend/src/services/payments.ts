import { config } from "../config";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/error";
import type { PaymentMethod } from "@prisma/client";
import { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────
// Payment providers
//
// Bankily and Masrivi expose merchant APIs to licensed merchants only; the
// exact endpoints/credentials are provided after signing a merchant
// agreement. The integration points below are production-shaped: fill in
// `initiate`/`verifyWebhook` with the contract you receive. Until then the
// provider throws a clear 503 so no order silently "pays" without a real
// transaction. CASH and WALLET are fully implemented.
// ─────────────────────────────────────────────────────────────

export interface InitiateResult {
  reference: string;
  // Deep-link / USSD instructions shown to the customer to complete payment.
  instructions?: string;
}

interface MobileMoneyProvider {
  initiate(orderId: string, amount: number, payerPhone: string): Promise<InitiateResult>;
}

function stubProvider(name: string, cfg: { apiUrl?: string; merchantId?: string; apiKey?: string }): MobileMoneyProvider {
  return {
    async initiate() {
      if (!cfg.apiUrl || !cfg.merchantId || !cfg.apiKey) {
        throw new HttpError(503, `${name} payment is not configured yet — use CASH or WALLET`);
      }
      // TODO(merchant-integration): call cfg.apiUrl with merchant credentials.
      throw new HttpError(503, `${name} integration pending merchant credentials`);
    },
  };
}

export const bankily = stubProvider("Bankily", config.payments.bankily);
export const masrivi = stubProvider("Masrivi", config.payments.masrivi);

// Debits the customer wallet atomically; rejects on insufficient balance.
export async function chargeWallet(userId: string, amount: number, orderId: string) {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (Number(user.walletBalance) < amount) {
      throw new HttpError(402, "Insufficient wallet balance");
    }
    await tx.user.update({
      where: { id: userId },
      data: { walletBalance: { decrement: new Prisma.Decimal(amount) } },
    });
    await tx.walletTransaction.create({
      data: { userId, type: "ORDER_PAYMENT", amount: -amount, orderId },
    });
  });
}

export async function creditWallet(
  userId: string,
  amount: number,
  type: "TOPUP" | "EARNING" | "REFUND" | "ADJUSTMENT",
  orderId?: string,
  note?: string,
) {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { walletBalance: { increment: new Prisma.Decimal(amount) } },
    }),
    prisma.walletTransaction.create({ data: { userId, type, amount, orderId, note } }),
  ]);
}

export async function initiatePayment(
  method: PaymentMethod,
  orderId: string,
  amount: number,
  payerPhone: string,
): Promise<{ status: "PENDING" | "PAID"; reference?: string; instructions?: string }> {
  switch (method) {
    case "CASH":
      // Cash is collected by the driver at delivery time.
      return { status: "PENDING" };
    case "WALLET":
      return { status: "PAID" };
    case "BANKILY": {
      const r = await bankily.initiate(orderId, amount, payerPhone);
      return { status: "PENDING", ...r };
    }
    case "MASRIVI": {
      const r = await masrivi.initiate(orderId, amount, payerPhone);
      return { status: "PENDING", ...r };
    }
  }
}
