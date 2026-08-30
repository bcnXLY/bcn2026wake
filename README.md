# BCN 2026 Wake — Event Companion PWA

A disposable, mobile-first Progressive Web App for a one-week private event with
~400–500 pre-registered attendees. Built to run on AWS + third-party free tiers
and to be torn down after the event.

- **Frontend:** React 18 + TypeScript + Vite, installable PWA (`vite-plugin-pwa`).
- **Auth:** ID-based — an attendee is logged in if their ID exists in the roster.
- **Data:** DynamoDB (attendee roster + team notice boards), Lambda + API Gateway (SAM).
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

Set `VITE_ENABLE_TEST_LOGIN_BUTTON=true` in `.env.local`, then click
**“Enter demo”** on the login screen to load a mock attendee and explore every
tab. The button is hidden unless that var is set, so it never ships to prod. To
force demo mode for the entire session (skips the button), set
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
| `VITE_ENABLE_TEST_LOGIN_BUTTON` | `true` to show the “Enter demo” button (local dev only; hidden unless set) |

Only non-secret, public values are ever exposed to the client bundle (`VITE_*`).

---

## How login works

There are **no passwords**. An attendee enters their ID and is granted access if
it exists in the roster; leaders and maintainers additionally confirm an SMS
code (Twilio Verify):

1. Enter attendee ID → `GET /login?id=...` looks the ID up in the DynamoDB
   `Participants` table. A 404 means the ID is not on the roster.
2. **Members** get their profile straight back.
   **Leaders / maintainers** get `{ requires2FA: true }` and a 6-digit code by
   SMS; the app then calls `GET /login?id=...&code=...` to verify it. The code
   is entered in six single-digit boxes (paste and SMS autofill both work) and
   submits itself once the last digit lands. "Resend code" is available after a
   30-second cooldown.
3. The attendee's profile (name, church, team, room, role) is returned and the
   app stores it locally to keep the session across reloads.

---

## ID card details (organiser-only)

The roster carries three Spanish ID card fields — `support_number`,
`emision_date`, `expiration_date` — and is missing some of them for part of the
camp. Rather than chase people, **the app asks the attendee**: a session whose
roster row lacks any of the three gets a form instead of the app, and nothing
else, until it is filled in.

- The values are for the organisers. They are never rendered anywhere in the
  app and never sent to the client — a profile carries only
  `missingDocumentFields`, the *names* of the fields still blank. The form
  therefore asks only for what is missing, and never shows back what is on file.
- `GET /profile?id=...` returns the same list on its own. The app re-checks it on
  every start, so sessions that logged in before the form existed are gated too.
  A failed check keeps whatever the stored session said — a flaky network must
  not lock anyone out.
- `PUT /profile` takes `{ id, supportNumber?, emisionDate?, expirationDate? }`
  (and still `{ id, phone }` for the profile tab). Only the fields present in
  the body are written, and it answers with what is *still* missing, which is
  what lifts the gate. Support numbers are uppercased and stripped of spaces;
  dates are accepted as `YYYY-MM-DD` or `DD/MM/YYYY` and stored as `DD/MM/YYYY`
  to match the roster.
- To rehearse it in demo mode: `?docs=all`, or `?docs=emisionDate,expirationDate`
  for the partial case.

Like the rest of this API there is no password behind it: knowing an attendee ID
is enough to answer for that attendee, which is the same trust model as login.

---

## Team notices (小组公告)

Each team has one notice board, stored in the `TeamMessages` table (`team_id`
partition key, timestamp-prefixed `message_id` sort key, so a single query
returns a board in order). Team 0 is the staff team and has its own board;
only `unassigned` means the participant has no board yet.

- `GET /messages?id=...` — the caller's own board. The team and posting rights
  come from their roster record, so nobody can read or post to another team's
  board by changing the request.
- `POST /messages` — post a notice. Allowed for everyone on the team **except**
  members (`role = 0`), who read only.
- `DELETE /messages?id=...&messageId=...` — delete a notice. A condition on
  `sender_id` means only the author can delete their own message; the UI asks
  for confirmation on the card first.

Sender name and role are denormalised onto each message, so a board renders
without a lookup per message. In demo mode the boards live in memory.

An open board polls every 25s and refreshes whenever the app regains focus, so
someone else's notice appears without leaving the tab. Polling skips hidden tabs
and pauses while you are posting or confirming a delete, and a failed poll leaves the board
untouched.

---

## The Finite ONE (field games)

A mini-app inside the app, reachable **only while the Field Games activity is
running** — the schedule's top card becomes a door for those two and a half
hours and looks perfectly ordinary before then. The whole app also turns dark
for the duration. Design notes and the reasoning behind the data model live in
[docs/finite-one-plan.md](docs/finite-one-plan.md).

World health is life points: a single float the backend owns. Time subtracts
from it once a minute, sacrificed team points add to it, and the **decay pace is
private** — it never appears in an API response or the client bundle.

It is shown as a three.js wireframe globe rather than a bar — continents in
points, fog turning inside it, the percentage over the middle — going emerald →
cyan → ash → yellow → orange → red as the world runs out, with the same colour
driving every accent on screen. It glitches more the worse things get, and at
zero it freezes grey and parks the render loop entirely. three.js loads as its
own lazy, precached chunk, renders at a capped 30fps, stops while the tab is
hidden, and falls back to a CSS orb where WebGL is unavailable.

Three dashboards, chosen server-side from the caller's roster row (never from
the request): **players** (roles 0–1 on teams 1–30) see their team, the meter,
their points and a QR code; **game masters** (role 8) get a scanner and the
award form; everyone else spectates. Nobody — game masters included — ever
receives another team's points, and the standings carry ranks only.

```bash
# Start it. No fixed duration: it runs until you end it or the world hits zero.
cd infra/scripts
python start_game.py --pace 0.6

python set_pace.py --status   # health, pace, projected minutes to collapse
python set_pace.py 1.6        # speed up the collapse, mid-game, no jump
python set_pace.py 0          # freeze the meter
python start_game.py --end    # stop
python start_game.py --reset  # wipe scores + ledger after a rehearsal
```

Game masters are expected to lose signal in a field, so every submission is
queued on their device with a locally generated id and replayed when the network
returns — the id is what stops a retry awarding twice. A team can never be taken
below zero: that submission is refused, shown in the history, and deliberately
cannot be resent.

```bash
cd infra/lambda && python -m unittest test_game_state   # decay maths, ranking, roles
```

To rehearse the late states, set `localStorage['bcn2026-demo-health'] = '8'` in
demo mode and reload — the world starts there instead of at full health.

## Project structure

```
index.html                 PWA entry (OneSignal SDK, iOS meta tags)
vite.config.ts             PWA manifest + Workbox runtime caching
src/
  config.ts                Runtime config + demo-mode toggle (VITE_* env)
  types.ts                 Shared domain types
  main.tsx / App.tsx       Bootstrap + auth-gated routing (Login | ID card
                           gate | Dashboard)
  context/AuthContext.tsx  Session state (profile in localStorage), demo profile
  pages/                   Login (attendee id), Dashboard (tab shell)
  components/
    Header, BottomNav, LanguageSelector, PushBanner, Lightbox
    DocumentGate.tsx       Blocks the app until the ID card details are given
    tabs/                  Profile, Schedule (live "NOW"), Messages (team
                           notice board), Gallery, Contacts
  game/                    "The Finite ONE" — full-screen field-games mini-app
    FiniteOne.tsx          Shell: role routing, own dark theme, tab bar
    useGameState.ts        Poll (jittered, visibility-gated, backoff) + cache
    WorldMeter.tsx         The world's life points, as a planet
    planet/                three.js scene + shaders
    awardQueue.ts          Game master outbox: localStorage, ids, replay
    player/ gm/            Team + QR · scanner, award form, history
  services/
    auth.ts                ID-based login client (GET /login), profile +
                           ID card details (GET/PUT /profile)
    contacts.ts            Role-based directory (GET /contacts) + demo data
    messages.ts            Team notice board (GET/POST/PUT /messages)
    game.ts                Field games (GET /game, POST /game/award)
    googleDrive.ts         Drive API v3 albums + images
    push.ts                OneSignal init / identify / permission
  data/eventData.ts        Static schedule + emergency contacts (edit + redeploy)
  utils/useEventTheme.ts   Turns the whole app dark during the field games
  i18n/                    react-i18next setup + en/es/zh locales
infra/
  template.yaml            SAM: DynamoDB roster + notice boards + game + Lambda API
  lambda/                  login, contacts, update_profile, messages, util,
                           game_state (+ tests), game, tick,
                           push (OneSignal fan-out for the global board)
  scripts/                 start_game.py, set_pace.py (talk to DynamoDB directly)
  seed/                    upload_participants.py (roster → DynamoDB),
                           broadcast.mjs (OneSignal push), participants.csv
docs/finite-one-plan.md    Field-games design notes and data model
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

Edit the roster CSV (`name,id,birthday,sex,phone,church,team,role,room,`
`permissions,magic_numbers,support_ number,emision_date,expiration_date`) and
point the loader at it: `python upload_participants.py --csv ../../src/data/participants.csv`.
The last three columns are the ID card details above; blank cells are left
unset, which is exactly what makes the app ask that attendee for them. The
loader writes whole rows, so **re-export the table into the CSV before
re-seeding** or a stale file will wipe details attendees have filled in.

Posting to the **global board** also sends a web push to every subscriber —
`MessagesFn` calls OneSignal server-side (`infra/lambda/push.py`), so the REST
key never reaches the browser. It needs the `ONESIGNAL_APP_ID` and
`ONESIGNAL_REST_API_KEY` repository secrets; without them the stack still
deploys and posts still work, they just do not notify. Team and room boards
never push.

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
