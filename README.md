# Meshily Delivery — مشيلي للتوصيل

منصة توصيل متكاملة لموريتانيا (نواكشوط أولًا): طرود، طعام، مشتريات وبضائع — بنظامَي توصيل: **دراجة نارية 🛵** و**شاحنة/سيارة 🚚**.

A complete delivery platform for Mauritania (Nouakchott-first): parcels, food, purchases and goods — with two delivery modes: **motorbike 🛵** and **truck/car 🚚**.

---

## 🏗 Architecture | البنية

| المكوّن | التقنية | المسار |
|---|---|---|
| Backend API + Realtime | Node.js (Express + TypeScript) + Prisma + PostgreSQL + Redis + Socket.io | [`backend/`](backend) |
| لوحة تحكم الأدمن | React (Vite + TypeScript) + MapLibre GL | [`admin/`](admin) |
| تطبيق الزبون | Flutter (Android + iOS) | [`mobile/customer_app/`](mobile/customer_app) |
| تطبيق السائق | Flutter (Android + iOS) | [`mobile/driver_app/`](mobile/driver_app) |
| النشر | Docker Compose (Postgres + Redis + Backend + Admin) | [`docker-compose.yml`](docker-compose.yml) |

```
Customer App ─┐                       ┌─ PostgreSQL (orders, users, wallets…)
Driver App   ─┼─ REST + Socket.io ──► Backend ─┤
Admin Panel  ─┘        (JWT)                   └─ Redis (GEO live locations, OTP rate-limit)
```

## ✨ Features | المميزات

**الزبون** — تسجيل بالهاتف + OTP، سائقون قريبون على الخريطة لحظيًا مع التقييم وزمن الوصول، حساب السعر تلقائيًا حسب المسافة ونوع المركبة، تتبع حي مع انزلاق سلس لأيقونة السائق، إشعارات لكل مرحلة، سجل الطلبات + إعادة الطلب بنقرة، تقييم السائق، دفع: نقدًا / محفظة / Bankily / Masrivi، دردشة واتصال بالسائق، عربي/فرنسي + وضع ليلي.

**السائق** — تسجيل بالوثائق (رخصة/هوية/مركبة) بانتظار موافقة الأدمن، تبديل متاح/غير متاح، بث الموقع عبر GPS، استقبال العروض مع عدّاد زمني، تحديث حالة الطلب خطوة بخطوة، ملاحة خارجية، أرباح يومية/أسبوعية/شهرية، طلبات سحب الأرباح.

**الأدمن** — دخول قياسي يُفتح حسب **الدور في قاعدة البيانات** (لا بيانات مثبّتة في الكود) + دعم 2FA، موافقة/رفض السائقين مع مراجعة الوثائق، إدارة الزبائن والحظر، خريطة عمليات حية لكل نواكشوط، إدارة التعرفات والعمولة، معالجة طلبات السحب، إشعارات وعروض جماعية، إحصائيات وأكثر المناطق طلبًا، **سجل تدقيق كامل** لكل إجراء إداري.

## 🚀 Quick start (development)

Requirements: Node 22+, PostgreSQL 16, Redis 7.

```bash
# 1) Backend
cd backend
cp .env.example .env               # then edit
npm install
npx prisma migrate dev             # creates the schema
SUPER_ADMIN_PHONE=+222XXXXXXXX SUPER_ADMIN_PASSWORD='choose-strong' npm run seed
npm run dev                        # http://localhost:4000

# 2) Admin panel
cd ../admin
npm install
npm run dev                        # http://localhost:5173 (proxies /api to :4000)

# 3) Mobile apps (Flutter 3.19+)
cd ../mobile/customer_app
flutter create . --platforms=android,ios   # generates android/ & ios/ shells (first time only)
flutter pub get
flutter run --dart-define=API_BASE=http://10.0.2.2:4000
# same for ../driver_app
```

> **Dev OTP**: with `OTP_DEV_MODE=true` the OTP code is returned by the API/shown in the app — no SMS gateway needed for testing. Wire the production SMS gateway in `backend/src/utils/otp.ts`.

## 🐳 Production (Docker)

```bash
cp backend/.env.example .env       # fill JWT secrets + SUPER_ADMIN_* privately
docker compose up -d --build
docker compose exec backend npx prisma db seed
# Admin panel → http://<server>:8080 — Backend API → :4000
```

Put a TLS reverse proxy (Caddy/Traefik/Nginx + Let's Encrypt) in front for **HTTPS everywhere**, and schedule `pg_dump` backups (e.g. daily cron to object storage).

## 🔐 Security model | النموذج الأمني

- **لا توجد بيانات أدمن مثبّتة في الكود إطلاقًا.** أول حساب Super Admin يُنشأ عبر أمر seed من متغيرات بيئة تُضبط سرًّا على الخادم (`SUPER_ADMIN_PHONE/PASSWORD`)، ونموذج الدخول واحد للجميع — الصلاحيات تُقرأ من عمود `role` في قاعدة البيانات (RBAC).
- كلمات السر مشفّرة بـ **bcrypt (cost 12)**، والجلسات بـ JWT قصير العمر + Refresh tokens تُدوَّر عند كل استخدام.
- **2FA (TOTP)** متاح لحسابات الأدمن من `/api/auth/2fa/*`.
- OTP لكل حساب جديد + حدود معدل على طلبات OTP وتسجيل الدخول.
- Helmet + rate limiting + Zod validation على كل المدخلات.
- **Audit Log** لكل إجراء إداري (من فعل ماذا ومتى ومن أي IP).

## 💳 Payments | الدفع

`CASH` و `WALLET` مفعّلان بالكامل (شحن، خصم، استرجاع عند الإلغاء، أرباح السائق، سحب). تكاملا **Bankily** و**Masrivi** جاهزان هيكليًا في `backend/src/services/payments.ts` — تُستكمل بيانات التاجر بعد توقيع اتفاقيتي الاندماج (تُرفض المدفوعات بوضوح حتى ذلك الحين بدل «نجاح» وهمي).

## 🗺 Maps | الخرائط

- التطوير يعمل فورًا ببلاطات OSM بلا مفاتيح.
- للإنتاج والهوية البصرية: ضع رابط ستايل Mapbox/MapTiler في `VITE_MAP_STYLE_URL` (لوحة الأدمن) و `TILE_URL` عبر `--dart-define` (التطبيقات).
- أحياء نواكشوط (تفرغ زينة، لكصر، السبخة، عرفات، توجنين، الميناء، دار النعيم…) مزروعة في القاعدة كنقاط بحث سريع — أضف المزيد من لوحة الأدمن أو seed.

## 📡 Realtime protocol (Socket.io)

| Event | Direction | Payload |
|---|---|---|
| `location:update` | driver → server | `{lat, lng, heading}` → Redis GEO + broadcast |
| `driver:location` | server → customer(order room)/admins | live marker updates |
| `drivers:nearby` | customer → server (ack) | nearby drivers with ETA & rating |
| `order:offer` | server → driver | new order offer (with countdown) |
| `order:status` / `order:accepted` / `order:no_driver` | server → room | lifecycle updates |
| `order:subscribe` | client → server (ack) | join an order's room (authorized only) |
| `chat:send` / `chat:message` | bidirectional | in-order chat |

## 📱 Push notifications (FCM)

يعمل الخادم بدون Firebase في التطوير (يُسجّل الإشعارات في السجل + يخزنها في القاعدة). للإنتاج: أنشئ مشروع Firebase، ضع مسار Service Account في `FIREBASE_SERVICE_ACCOUNT_PATH`، أزل التعليق عن `firebase_messaging` في التطبيقين وسجّل التوكن عبر `POST /api/users/me/fcm-token`.

## 🧪 Verified end-to-end

The full flow was exercised against a live server: customer OTP registration → driver registration → admin approval → driver online (GPS→Redis GEO) → quote → order → realtime offer → accept → status flow → delivery → driver earnings → rating → withdrawal request → admin payout → audit log. Socket layer verified: nearby-drivers with ETA, order rooms, live chat delivery.
