# BCN 2026 Wake — Event Companion PWA

A disposable, mobile-first **Progressive Web App** for a 1-week private event with
400–500 pre-registered attendees. Built to run entirely on AWS + third-party free
tiers (**$0 base cost**) and to be torn down after the event.

## Why this stack

| Concern | Choice | Free-tier fit |
|---|---|---|
| UI | React 18 + TypeScript + Vite | — |
| App shell / push | `vite-plugin-pwa` + OneSignal Web SDK v16 | iOS "Add to Home Screen", $0 |
| Auth | AWS Cognito User Pool (`amazon-cognito-identity-js`) | 50k MAU free |
| Serverless API | AWS Lambda + API Gateway (SAM) | 1M req/mo free |
| OTP store | DynamoDB (TTL) | 25 GB free |
| OTP delivery | SES (email) / SNS (SMS) | free/near-free at this volume |
| Photos | Google Drive API v3 (client-side key) | free |
| Hosting | S3 + CloudFront | free tier |
| CI/CD | GitHub Actions | free |

## Features (mapped to requirements)

- **Strict auth**: no public sign-up. Attendees are bulk pre-provisioned. First
  login is ID-only → OTP to registered email/SMS → set a permanent password.
  Returning logins use ID + password (Cognito JWT).
- **Locked mobile layout**: sticky header (Team info + language selector),
  scrollable body, sticky bottom tab bar (4 tabs).
- **Tabs**: Profile (registry data + custom links), Real-time Schedule (live
  "NOW" marker driven by device clock), Gallery (Google Drive grid), Emergency
  Contacts (`tel:` click-to-call).
- **i18n**: English / Spanish / Chinese (Simplified) — instant switch, state
  preserved, available on login **and** dashboard.
- **Push (optional)**: OneSignal web push + PWA manifest/service worker for iOS.

## Project layout

```
index.html                 PWA entry (+ OneSignal SDK, iOS meta)
vite.config.ts             PWA manifest + Workbox runtime caching
src/
  config.ts                Runtime config from VITE_* env vars
  i18n/                     react-i18next setup + en/es/zh-CN locales
  services/
    auth.ts                Cognito login + first-login OTP client
    googleDrive.ts         Drive API v3 gallery fetch
    push.ts                OneSignal init / identify
  context/AuthContext.tsx  Session state + profile from JWT claims
  components/              Header, BottomNav, LanguageSelector, PushBanner, tabs/
  pages/                   Login (id → password | otp), Dashboard
  data/eventData.ts        Static schedule + emergency contacts (edit + redeploy)
infra/
  template.yaml            SAM: Cognito, DynamoDB, Lambda API
  lambda/                  firstLoginStatus | Start | Complete (OTP flow)
  seed/                    seedUsers.mjs (roster → Cognito), broadcast.mjs
.github/workflows/         deploy-frontend.yml, deploy-backend.yml
```

## Setup

### 1. Backend (once)

Requires a verified SES sender address for OTP emails.

```bash
cd infra
sam build
sam deploy --guided \
  --stack-name bcn2026-backend \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides SesFromAddress="no-reply@yourdomain.com"
```

Note the stack outputs: `UserPoolId`, `UserPoolClientId`, `ApiBaseUrl`.

### 2. Pre-provision attendees

Edit `infra/seed/roster.csv` (`id,name,email,phone,team_name,links`), then:

```bash
cd infra/seed
npm install
AWS_REGION=us-east-1 COGNITO_USER_POOL_ID=us-east-1_XXXX npm run seed
```

Idempotent — safe to re-run when the roster changes.

### 3. Frontend

```bash
cp .env.example .env          # fill in the values from step 1 + integrations
npm install
npm run dev                   # local dev
npm run build                 # production bundle → dist/
```

### 4. Google Drive gallery

- Make the folder **"Anyone with the link — Viewer"**.
- Create a **browser-restricted** API key (HTTP referrer = your CloudFront domain,
  Drive API enabled). Put the key + folder ID in the env vars.

### 5. Push (optional)

Create a OneSignal app (Web), set the site URL to your CloudFront domain, and put
`VITE_ONESIGNAL_APP_ID` in the env. Broadcast manually:

```bash
ONESIGNAL_APP_ID=xxx ONESIGNAL_REST_API_KEY=xxx \
  node infra/seed/broadcast.mjs "Keynote in 10 min" "Auditorium A"
```

## CI/CD — GitHub configuration

**Repository → Settings → Secrets and variables → Actions**

Secrets (sensitive):
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`,
`GOOGLE_DRIVE_API_KEY`, `GOOGLE_DRIVE_FOLDER_ID`,
`ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`.

Variables (non-secret build/deploy config):
`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `API_BASE_URL`,
`S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`.

`deploy-frontend.yml` runs on push to `main` (build → S3 sync → CloudFront
invalidate). `deploy-backend.yml` is manual (`workflow_dispatch`).

## Security notes

- No public registration; Cognito pool has `AllowAdminCreateUserOnly: true`.
- OTPs are stored **hashed** (SHA-256) with a DynamoDB TTL, verified in constant
  time, and rate-limited (5 attempts).
- The Google Drive key is browser-restricted and read-only.
- Only non-secret values are exposed to the client bundle (`VITE_*`).

## Teardown (after the event)

```bash
aws cloudformation delete-stack --stack-name bcn2026-backend
# remove the S3 bucket + CloudFront distribution, disable the OneSignal app.
```

## Icons

Add binary PWA icons before deploying — see [public/ICONS_README.md](public/ICONS_README.md).
