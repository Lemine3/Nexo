import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { initSockets } from "./sockets";
import { errorHandler } from "./middleware/error";
import { authRouter } from "./routes/auth";
import { ordersRouter } from "./routes/orders";
import { driversRouter } from "./routes/drivers";
import { usersRouter } from "./routes/users";
import { walletRouter } from "./routes/wallet";
import { placesRouter } from "./routes/places";
import { adminRouter } from "./routes/admin";
import { uploadsRouter, UPLOADS_DIR } from "./routes/uploads";

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: "2mb" }));

// Global rate limit; auth endpoints get a stricter one.
app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true }));
app.use("/api/auth", rateLimit({ windowMs: 60_000, limit: 20 }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "meshily-backend" }));

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/drivers", driversRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/places", placesRouter);
app.use("/api/admin", adminRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "7d" }));

app.use(errorHandler);

const server = http.createServer(app);
initSockets(server);

server.listen(config.port, () => {
  console.log(`Meshily backend listening on :${config.port} (${config.env})`);
});
