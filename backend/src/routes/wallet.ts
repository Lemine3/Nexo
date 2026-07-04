import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncH, HttpError } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { creditWallet } from "../services/payments";
import { config } from "../config";

export const walletRouter = Router();
walletRouter.use(requireAuth);

walletRouter.get(
  "/",
  asyncH(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const transactions = await prisma.walletTransaction.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({
      balance: Number(user.walletBalance),
      transactions: transactions.map((t) => ({ ...t, amount: Number(t.amount) })),
    });
  }),
);

// Wallet top-up. In production this goes through Bankily/Masrivi and is
// confirmed by the provider webhook; the direct credit below is only allowed
// in development mode so the full order flow can be tested end-to-end.
walletRouter.post(
  "/topup",
  asyncH(async (req, res) => {
    const { amount } = z.object({ amount: z.number().positive().max(1_000_000) }).parse(req.body);
    if (config.env === "production") {
      throw new HttpError(503, "Top-up must go through Bankily/Masrivi in production");
    }
    await creditWallet(req.user!.id, amount, "TOPUP", undefined, "Dev top-up");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    res.json({ balance: Number(user.walletBalance) });
  }),
);
