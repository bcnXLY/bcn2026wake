# BCN 2026 Wake — Event Companion PWA

A disposable, mobile-first Progressive Web App for a one-week private event with
~400–500 pre-registered attendees. Built to run on AWS + third-party free tiers
and to be torn down after the event.

- **Frontend:** React 18 + TypeScript + Vite, installable PWA (`vite-plugin-pwa`).
- **Auth:** ID-based — an attendee is logged in if their ID exists in the roster.
- **Data:** DynamoDB (attendee roster), Lambda + API Gateway (SAM).
- **Extras:** Google Drive gallery, OneSignal web push, i18n (EN / ES / ZH).

---

## Quick start (local, no AWS needed)

The app ships with a **demo mode** that mocks auth, contacts, and the gallery, so
you can run and develop the whole UI without any backend or credentials.

```bash
nvm use 24            # Node 24.x
npm install
npm run dev           # http://localhost:5173
```

On the login screen click **“Enter demo”** to load a mock attendee and explore
every tab. To force demo mode for the entire session (skips the button), set
`VITE_DEMO_MODE=true` in `.env`.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) + production bundle → `dist/` |
| `npm run preview` | Serve the built `dist/` locally |

---

## Running against a real backend

Copy the example env file and fill in values from your deployed stack, then run
`npm run dev` as above.

```bash
cp .env.example .env
```

| Env var | What it is |
|---|---|
| `VITE_API_BASE_URL` | API Gateway base URL (`.../prod`) |
| `VITE_GOOGLE_DRIVE_API_KEY` | Browser-restricted, read-only Drive key |
| `VITE_GOOGLE_DRIVE_FOLDER_ID` | Public parent folder (albums = subfolders) |
| `VITE_ONESIGNAL_APP_ID` | OneSignal Web app ID (optional) |
| `VITE_DEMO_MODE` | `true` to force demo mode |
| `VITE_ENABLE_TEST_LOGIN_BUTTON` | `false` to hide the “Enter demo” button |

Only non-secret, public values are ever exposed to the client bundle (`VITE_*`).

---

## How login works

There are **no passwords and no OTP**. An attendee enters their ID and is granted
access if it exists in the roster:

1. Enter attendee ID → `GET /login?id=...` looks the ID up in the DynamoDB
   `Participants` table. A 404 means the ID is not on the roster.
2. The attendee's profile (name, church, team, room, role) is returned and the
   app stores it locally to keep the session across reloads.

---

## Project structure

```
index.html                 PWA entry (OneSignal SDK, iOS meta tags)
vite.config.ts             PWA manifest + Workbox runtime caching
src/
  config.ts                Runtime config + demo-mode toggle (VITE_* env)
  types.ts                 Shared domain types
  main.tsx / App.tsx       Bootstrap + auth-gated routing (Login | Dashboard)
  context/AuthContext.tsx  Session state (profile in localStorage), demo profile
  pages/                   Login (attendee id), Dashboard (tab shell)
  components/
    Header, BottomNav, LanguageSelector, PushBanner, Lightbox
    tabs/                  Profile, Schedule (live "NOW"), Gallery, Contacts
  services/
    auth.ts                ID-based login client (GET /login)
    contacts.ts            Role-based directory (GET /contacts) + demo data
    googleDrive.ts         Drive API v3 albums + images
    push.ts                OneSignal init / identify / permission
  data/eventData.ts        Static schedule + emergency contacts (edit + redeploy)
  i18n/                    react-i18next setup + en/es/zh locales
infra/
  template.yaml            SAM: DynamoDB roster + Lambda API
  lambda/                  login, contacts, util (REST handlers)
  seed/                    upload_participants.py (roster → DynamoDB),
                           broadcast.mjs (OneSignal push), participants.csv
.github/workflows/         deploy-frontend.yml, deploy-backend.yml
.github/workflows/         deploy-frontend.yml, deploy-backend.yml
```

---

## Backend & seed (deploy)

Deploying is only needed to test against the real DynamoDB roster — day-to-day UI
work uses demo mode. The project region is `eu-west-3`.

```bash
# 1. Deploy the stack
cd infra
sam build
sam deploy --guided \
  --stack-name bcn2026-backend \
  --capabilities CAPABILITY_IAM

# 2. Load the attendee roster into DynamoDB (idempotent — safe to re-run)
cd seed
pip install -r requirements.txt
python upload_participants.py

# 3. Broadcast a push (optional)
ONESIGNAL_APP_ID=xxx ONESIGNAL_REST_API_KEY=xxx \
  npm run broadcast -- "Keynote in 10 min" "Auditorium A"
```

Edit the roster in `infra/seed/participants.csv`
(`id,name,sex,phone,church,role,team,room,birthday`).

CI/CD lives in `.github/workflows/`: `deploy-frontend.yml` runs on push to `main`
(build → S3 → CloudFront invalidate); `deploy-backend.yml` is manual. Both use
GitHub OIDC (no long-lived AWS keys) — see the workflow files for the required
repository secrets and variables.

---

## Notes

- Add binary PWA icons before deploying — see [public/ICONS_README.md](public/ICONS_README.md).
- The Google Drive key is browser-restricted and read-only.
- Teardown after the event: `aws cloudformation delete-stack --stack-name bcn2026-backend`,
  then remove the S3 bucket + CloudFront distribution and disable the OneSignal app.
