# Discord Ticket Bot

بوت ديسكورد لنظام التذاكر (Ticket System) مع نظام سجل كامل وصلاحيات للإدارة.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — تشغيل السيرفر والبوت (port 8080)
- `pnpm run typecheck` — فحص TypeScript كامل
- `pnpm run build` — بناء جميع الحزم
- `pnpm --filter @workspace/db run push` — رفع تغييرات قاعدة البيانات

## Environment Variables Required

- `DISCORD_BOT_TOKEN` — توكن البوت من Discord Developer Portal
- `DISCORD_ENABLED` — تفعيل البوت (`true` / `false`)
- `DATABASE_URL` — رابط PostgreSQL (مُعد تلقائياً)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Discord: discord.js v14
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Build: esbuild (ESM bundle)

## Where things live

- `artifacts/api-server/src/bot/` — كود البوت الكامل
  - `index.ts` — تشغيل البوت وتوجيه الـ interactions
  - `commands.ts` — أمر `/ticket-setup` وإرسال اللوحة
  - `buttons.ts` — معالجة الأزرار (فتح، استلام، إغلاق، إضافة، حذف)
  - `modals.ts` — معالجة النوافذ (سبب الإغلاق، إضافة عضو)
  - `tickets.ts` — إنشاء القنوات، جمع الـ transcript، إرسال DM والسجل
  - `db.ts` — استعلامات قاعدة البيانات
- `lib/db/src/schema/tickets.ts` — جداول ticket_config و tickets

## Bot Commands & Features

### `/ticket-setup config`
- `log_channel` — قناة إرسال سجلات التذاكر
- `image` (اختياري) — رابط صورة لوحة التذاكر
- `description` (اختياري) — وصف لوحة التذاكر

### `/ticket-setup add-role`
- إضافة رتبة إدارة يمكنها إدارة التذاكر (استلام، إغلاق، إضافة أعضاء، حذف)

### `/ticket-setup remove-role`
- إزالة رتبة إدارة

### `/ticket-setup panel`
- إرسال لوحة التذاكر في قناة محددة

### أزرار داخل التذكرة
- **استلام ✅** — تعيين مسؤول للتذكرة (إدارة فقط)
- **إغلاق 🔒** — إغلاق مع سبب، إرسال DM للعضو، إرسال سجل (إدارة فقط)
- **إضافة عضو ➕** — إضافة مستخدم للقناة (إدارة فقط)
- **حذف 🗑️** — حذف القناة فوراً (إدارة فقط)

### HTTP Endpoints
- `GET /api/healthz` — فحص صحة السيرفر
- `GET /api/ping` — للاستخدام مع UptimeRobot/Render

## Architecture decisions

- البوت يعمل داخل نفس عملية Express لتبسيط النشر
- الأوامر تُسجَّل per-guild (فورية) وليس globally (تأخير ساعة)
- الـ transcript يُجمع كملف `.txt` ويُرسل كـ attachment في السجل وDM
- فحص صلاحيات الإدارة يتم في الزر والـ modal لضمان الأمان
- إذا لم تُحدَّد رتبة إدارة، يُشترط صلاحية Administrator

## Gotchas

- يجب تفعيل **Message Content Intent** في Developer Portal لجمع نص الرسائل في الـ transcript
- يجب تفعيل **Server Members Intent** لجلب بيانات الأعضاء عند إضافتهم
- البوت يحتاج صلاحيات: `Manage Channels`, `Manage Messages`, `View Channel`, `Send Messages`, `Read Message History`
- للاستخدام مع UptimeRobot، استخدم `/api/ping`
