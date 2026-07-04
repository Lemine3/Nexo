import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncH } from "../middleware/error";

// Nouakchott neighborhoods as quick-search landmarks (تفرغ زينة، لكصر،
// السبخة، عرفات...). Public — the order screen loads them before login too.
export const placesRouter = Router();

placesRouter.get(
  "/neighborhoods",
  asyncH(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const city = typeof req.query.city === "string" ? req.query.city : "Nouakchott";
    const neighborhoods = await prisma.neighborhood.findMany({
      where: {
        city,
        ...(q
          ? { OR: [{ nameAr: { contains: q } }, { nameFr: { contains: q, mode: "insensitive" } }] }
          : {}),
      },
      orderBy: { nameFr: "asc" },
    });
    res.json({ neighborhoods });
  }),
);
