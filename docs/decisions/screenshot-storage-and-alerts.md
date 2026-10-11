# Decision: where screenshots live, and how warnings reach traders

Date: 30 Sep 2026. Status: recommended, waiting for the owner.
Safety line: every broker connection stays read-only. Nothing here can place, change or cancel an order.

## A. Trade screenshots (PNG/JPEG/WebP, up to 5 MB each)

**Recommendation: a Cloudflare R2 bucket, kept private.**

| | Railway volume | Cloudflare R2 (recommended) |
|---|---|---|
| Cost | $0.15 per GB per month. The Hobby plan caps a volume at 5 GB. | $0.015 per GB per month. The first 10 GB are free. There are no download fees. |
| Redeploys | The app goes briefly offline on every deploy. | Not affected. |
| Growing | You can't run a second copy of the app while a volume is attached. | Not affected. |
| Backups | Railway offers them, but you have to set them up. | Files are stored durably by Cloudflare. You can turn on versioning as a safety net. |
| Private to the owner | Only by streaming files through the app. | Files stay private, and the app hands out links that expire after a few minutes. |

Both options can keep files private, and the app checks who is asking each time. R2 is cheaper, doesn't slow deploys, and lets the app grow later. About 2,000 screenshots at 5 MB is 10 GB, which is free on R2. A volume for the same would cost about $1.50 a month.

Sources: Cloudflare R2 pricing (developers.cloudflare.com/r2/pricing/); Railway plans (docs.railway.com/reference/pricing/plans); Railway volume limits (docs.railway.com/reference/volumes).

**Your setup steps (about 10 minutes)**
1. Sign up at dash.cloudflare.com and open R2 Object Storage. Add a payment card. It stays $0 while you are under the free amounts.
2. Click Create bucket. Name it `tradeos-screenshots`. Leave it private. Do not turn on "public access".
3. Open Manage R2 API Tokens and click Create API token. Choose "Object Read & Write" and limit it to that one bucket.
4. Copy the Access Key ID, the Secret Access Key, and the account's S3 endpoint. It looks like `https://<account-id>.r2.cloudflarestorage.com`. The secret is shown only once.
5. In Railway, open the TradeOS service, then Variables, and paste:
   - `S3_ENDPOINT`
   - `S3_BUCKET` (set to `tradeos-screenshots`)
   - `S3_ACCESS_KEY_ID`
   - `S3_SECRET_ACCESS_KEY`
   - `S3_REGION` (set to `auto`)
6. Redeploy, then tell the agent to build the upload feature. It is not built yet.

## B. Warnings outside the app (for example "80% of your daily loss limit")

**Recommendation: Web Push, added to the home screen. Email comes second, once the shared email setup exists.**

- **Web Push** works on Android in the browser and when installed. On iPhone it works only on iOS 16.4 or newer, and only after the trader taps Share, then "Add to Home Screen". They then have to tap an "Enable alerts" button inside the app. It won't work from a normal Safari tab. The app's manifest is already set to standalone. It is free and instant, and it needs a VAPID key pair (a free password pair, no account). Sources: WebKit, "Web Push for Web Apps on iOS and iPadOS" (webkit.org/blog/13878/); MDN, Push API.
- **Email** works everywhere but is slower to notice. It is blocked: the Agents backlog says TradeOS has "no email transport", and the fix is to copy Dukkani's shipped setup. It needs the owner's `RESEND_API_KEY` and `EMAIL_FROM`. That same setup also unlocks password reset.
- Push fits a time-sensitive warning better. Email is the fallback for anyone who hasn't installed the app.
- Note: the app currently has only an SVG icon. iPhone home-screen icons need PNG, so PNG icons get added when push is built.

**Your setup steps (about 5 minutes)**
1. On your Mac, open Terminal in the TradeOS folder and run `npx web-push generate-vapid-keys`. It prints a public key and a private key.
2. In Railway, open the TradeOS service, then Variables, and paste:
   - `VAPID_PUBLIC_KEY` (the public key)
   - `VAPID_PRIVATE_KEY` (the private key)
   - `VAPID_SUBJECT` (`mailto:` followed by your email address)
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (the public key again)
3. Redeploy, then tell the agent to build the alerts. It is not built yet. Keep the private key secret and never share it.
4. Test on your own phone. On iPhone, tap Share, then Add to Home Screen, open TradeOS from the new icon, and tap "Enable alerts".
5. Later, for the email fallback: create a Resend account, verify your sending domain, and paste `RESEND_API_KEY` and `EMAIL_FROM` into Railway.
