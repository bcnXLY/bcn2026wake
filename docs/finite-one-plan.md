# "The Finite ONE" — design & build notes

Status: **built.** The world meter is a materialised "life points" value driven
by a one-minute tick, the pace is a private attribute, and QR/auth stay as
originally specified.

Three calls I had to make to finish (§10 was still open) — each is one constant
away from the opposite choice:

| Decision | What it does | Where to change it |
|---|---|---|
| Health clamps at **100** | Sacrifices past full are absorbed, not banked | `MAX_HEALTH` in [game_state.py](../infra/lambda/game_state.py) |
| Zero is **terminal** | The tick sets `status: ended` and a late sacrifice cannot revive the world | `apply_decay()` in [tick.py](../infra/lambda/tick.py) |
| Game masters get **no early access** | Entry is gated purely on Field Games running, for everyone | `gameLive` in [ScheduleTab.tsx](../src/components/tabs/ScheduleTab.tsx) |

Rehearse in demo mode (`VITE_DEMO_MODE=true`, or the "Enter demo" button) — it
runs a whole game in memory, including the rejection paths.

---

## 1. What the repo gives us

| Thing | Reality today | Consequence |
|---|---|---|
| Roster | 429 people. `team_1`…`team_30`, `team_0` = staff (46), `unassigned` (4) | **30 playing teams**, numbered 1–30 |
| Roles | 0 member (329) · 1 leader (53) · 2–7 staff · **8 = game master (6)** · 9, 10 | Matches the spec |
| Role × team | Teams 1–30 hold **only** roles 0 and 1 (378 players). Team 0 holds only roles 2–10 | Clean split. 4 people in `unassigned` (2× role 0, 2× role 1) need a rule → §5.4 |
| Auth | `?id=…` is the credential; profile cached in `localStorage['bcn2026-profile']` | Role and team re-derived from DynamoDB on every call, like [messages.py](../infra/lambda/messages.py) |
| Field games | [eventData.ts](../src/data/eventData.ts) `s18`, `2026-09-01 15:30 → 18:00 +02:00` | Outdoors, afternoon sun → §6.3 |
| Frontend | React 18 + Vite PWA, **no router in use**, neumorphic light theme, i18n en/es/zh, `isDemoMode()` on every service | §6.1 |
| Backend | SAM, REST API, python3.12 arm64 256 MB, DynamoDB on-demand, `eu-west-3` | Add to the same stack |

---

## 2. The game model

World health is **life points**: one float that only the server owns.

```
health ← health − pace × Δminutes + Σ(world points awarded)
```

- **Time subtracts.** A scheduled tick Lambda subtracts `pace × elapsed`.
- **Players add.** World points from GM awards go into SQS and are applied by
  that same tick, so one writer computes the new health.
- **`pace` is private.** It lives in DynamoDB, is set only by your script, and
  never appears in any API response or in the client bundle.

Because the value is materialised, the client never computes anything — it
receives a number and renders it. Two nice consequences: device clock skew is
irrelevant (300 phones can't disagree), and you can change the pace at any moment
with no visible jump, because there is no formula being recomputed from `t=0`.

**Reads extrapolate, ticks materialise.** `GET /game` returns
`health − pace × (now − last_tick)` without writing anything, so the number is
fresh to the second regardless of tick frequency; the tick is what persists it
and applies the SQS additions. Same formula, both places.

> One honest note on hiding the pace: any client that polls twice can divide the
> delta by the elapsed time and estimate it. That's true of any design that shows
> a moving meter. It's out of the UI and out of the payload, which is what
> matters here.

---

## 3. Infrastructure

Additions to the existing SAM stack. Nothing new to operate.

```
EventBridge rule ──(1 min)──► TickFn ──► drains SQS ──► GameState.health
                                          (world points)

GM device ──► POST /game/award ──► GameFn ──┬──► GameAwards  (ledger, idempotent)
                                            ├──► GameState.scores  (team points)
                                            └──► SQS  (world points)

everyone ──► GET /game ──► GameFn ──► GameState (1 GetItem)
```

### 3.1 `GameState` — single item, `game_id = "finite-one"`

```jsonc
{
  "game_id":      "finite-one",
  "status":       "idle" | "running" | "ended",
  "world_health": 87.5,          // float
  "pace":         1.0,           // PRIVATE — never leaves the backend
  "last_tick_ms": 1788003000000,
  "started_at_ms": 1788000000000,
  "scores":       { "1": 340, "2": 120, … },   // all 30 pre-seeded to 0
  "version":      47
}
```

~3 KB → **0.5 RRU** per eventually-consistent read. Written by 6 GMs and one
tick; contention is nil.

### 3.2 `GameAwards` — the ledger

PK `award_id` (client UUID — the idempotency key). GSI **`byGame`**: PK
`game_id`, SK `received_at_ms`, for the history page.

```jsonc
{
  "award_id": "9f3c…", "game_id": "finite-one",
  "team": "7", "points": 40, "world_points": 0,
  "gm_id": "X6954024T", "gm_name": "陈振盛", "source": "qr" | "manual",
  "created_at_ms": 0,        // GM device clock
  "received_at_ms": 0,       // server clock
  "status": "applied" | "rejected",
  "reject_reason": "insufficient_points" | "not_running" | "invalid_team",
  "ttl": 0                   // auto-delete 7 days after the event
}
```

### 3.3 SQS — `WorldPoints.fifo`

**FIFO**, `MessageDeduplicationId = award_id`, single `MessageGroupId`. Body:
`{award_id, world_points}`.

Ordering doesn't matter (addition commutes) — FIFO is for the free dedup. It
closes one specific hole: if the ledger write succeeds but the SQS send fails,
the GM's resend hits the idempotency check and returns 200, so the world points
would be lost forever. Fix: **on the "already applied" path, re-send to SQS
anyway** — dedup makes that safe.

No event source mapping. The tick Lambda calls `receive_message` itself so that
draining and subtracting happen in the same update.

> Worth knowing: DynamoDB `SET health = health + :v` is already an atomic
> increment, so the award Lambda could add world points directly and correctly
> without a queue — provided the tick also uses an increment (`health - :decay`)
> rather than writing a computed absolute value. SQS buys you a durable retry
> buffer and a single place where the arithmetic happens; it costs one component
> and up to one tick of latency on a sacrifice. Planned as you specified; say the
> word if you'd rather drop it.

### 3.4 The tick — EventBridge minimum is 1 minute

AWS will not schedule faster than `rate(1 minute)`, so a true 30 s cadence needs
the Lambda to tick, `sleep(30)`, tick again. That works and costs ~$0.01 for the
whole game, but the function needs `Timeout: 60` (the `Globals` block sets 10 s).

Because reads extrapolate (§2), the tick frequency only controls **how fast a
sacrifice shows up on the meter** — not accuracy. At 60 s a team can wait up to a
minute after giving up their points before the meter moves, which is a long time
when they're watching for it. 30 s is the better feel; 60 s is the simpler
config. → §10.

The rule stays permanently enabled; the Lambda no-ops unless `status == running`
(one 0.5 RRU read), so there's nothing to remember to turn on or off.

### 3.5 API — three routes, one Lambda (`infra/lambda/game.py`)

All on the **existing REST API**, so no second base URL and no frontend config
change.

**`GET /game?id=…`** — every client, shaped by role:

```jsonc
{
  "status": "running",
  "worldHealth": 87.5,
  "view": "player",                                  // player | spectator | gm
  "team": "7",                                       // from the roster
  "teamPoints": 340,                                 // caller's own team only
  "leaderboard": [ { "rank": 1, "team": "12" }, … ]  // never any points
}
```

No `pace`. No other team's points, for any role — the game master's leaderboard
is point-free too, per the spec.

**`POST /game/award`** — role 8 only. Body: `id`, `awardId`, `team`, `points`,
`worldPoints`, `source`, `createdAt`.

**`GET /game/awards?id=…`** — role 8 only, last 50 from the GSI.

### 3.6 The award write

```
TransactWriteItems([
  Put   (GameAwards, item, Condition: attribute_not_exists(award_id)),
  Update(GameState, SET scores.#t = scores.#t + :p, version = version + :one,
                    Condition: status = "running" AND scores.#t >= :abs_p)
])
→ then SQS send if world_points > 0
```

Cancellation on the **first** condition = already applied → **200** (plus the
SQS re-send from §3.3). On the **second** = a real rejection, recorded and
returned with a reason.

---

## 4. Cost

300 clients, 120 minutes, polling every 20 s and only while the tab is visible
(the pattern already in [MessagesTab](../src/components/tabs/MessagesTab.tsx) —
phones spend most of a field game in pockets). ~110 k requests with headroom.

| | Volume | eu-west-3 |
|---|---|---|
| API Gateway (REST) | 110 k requests | $0.39 |
| Lambda — reads | 110 k × ~40 ms | $0.04 |
| Lambda — tick | 240 × ~31 s | $0.01 |
| DynamoDB reads | 55 k RRU | $0.02 |
| DynamoDB writes | ~2 k transactional + GSI | $0.02 |
| SQS | ~2 k messages | $0.00 (free tier) |
| Data transfer | ~165 MB | $0.02 |
| **Total** | | **≈ $0.50** |

Free-tier credit likely makes it literally $0. The only unbounded risk is a
client retry loop with no backoff — so: exponential backoff plus a **$5 AWS
Budget alert** as the backstop.

---

## 5. The rules we're keeping

### 5.1 Idempotency UUIDs on every award

Every award carries a client-generated `award_id`, written with
`attribute_not_exists`. Without it, a retry whose *response* was lost — but whose
write landed — awards twice. **A duplicate returns 200, not an error**, or the
offline queue never drains.

All score writes are relative increments (`scores.#t + :p`), never
`scores.#t = :new`, so two GMs syncing at the same moment both land.

### 5.2 Team points floor at 0, and that failure is terminal

`ConditionExpression: scores.#t >= :abs_points` on every negative award. On
failure the award is written to the ledger as `rejected` /
`insufficient_points`, and the history page shows it in error **with no resend
button**.

That gives the queue two distinct failure classes, and the UI must tell them
apart:

| Class | Cause | History shows |
|---|---|---|
| Transient | offline, network error, 5xx | ⏳ pending — auto-retries, manual resend available |
| Terminal | insufficient points, game not running, invalid team | ✕ error + reason — **no resend** |

An award queued offline against a team without the points fails at sync time,
possibly 20 minutes later. That's expected and is exactly what the history page
is for.

### 5.3 Pace is private

Set only by `set_pace.py` writing to DynamoDB. Absent from every API response and
from the client bundle. (Caveat in §2.)

### 5.4 Who gets which dashboard

Resolved server-side, never from the request:

```
role == 8                      → gm
role in (0, 1) AND team 1..30  → player
everything else                → spectator
```

Team 0 (46 staff) and `unassigned` (4 people) both land on spectator.

### 5.5 The entry point

The clickable target is the top card on the schedule tab — the same
`.countdown.card` element — **and only while Field Games is the currently running
activity**, i.e. `currentActivity(...)?.id === 's18'`. Before 15:30 it renders
exactly as it does today, so nothing is spoiled.

Note this is the card's **"NOW" state**, not its countdown state:
[ScheduleTab.tsx:48](../src/components/tabs/ScheduleTab.tsx#L48) only renders the
countdown when *no* activity is current, and swaps to the "NOW" layout the moment
the activity starts. So the "ENTER" affordance goes on the NOW branch.

---

## 6. Frontend

### 6.1 Routing — full-screen overlay, no router

`react-router-dom` is installed but unused, and adding `BrowserRouter` needs a
CloudFront SPA fallback (403/404 → `/index.html`) that isn't configured. Not
worth the risk for one afternoon.

`Dashboard` gains a `gameOpen` state rendering `<FiniteOne />` full-screen in
place of the tab shell, persisted in `sessionStorage` so a refresh or an iOS PWA
relaunch returns to the game. GM history is a second view inside that shell.
Consistent with the app's existing tabs-as-state model.

### 6.2 Components

```
src/game/
  FiniteOne.tsx          shell: role routing, dark theme root, tab bar
  useGameState.ts        poll (jittered 20 s, visibility-gated, backoff) + cache
  WorldMeter.tsx         the planet + readout (three.js, see §6.5)
  Leaderboard.tsx        ranks only; shared ranks on ties (=4)
  player/TeamTab.tsx     team no. · meter · points · QR button
  gm/ScanTab.tsx         camera + manual team + points + world points + submit
  gm/HistoryPage.tsx     queue + sent, status per item, resend where allowed
  awardQueue.ts          localStorage queue, UUIDs, drains on reconnect
src/game/finite-one.css  scoped dark tokens under .fo-root
```

The meter animates between polled values with a CSS transition, so a discrete
server value reads as a living gauge rather than a stepping counter.

### 6.3 Libraries

- **QR generation** — `qrcode` (~20 KB gz) to canvas. Payload `FO1:<team>` (the
  prefix lets the scanner reject unrelated QRs). The team number comes from the
  server response, not from localStorage. Practical: Field Games is outdoors at
  15:30 in September — render it **large**, request a wake lock, force max
  brightness while shown, error correction M. A small dense QR will not scan in
  direct sun.
- **QR scanning** — `jsqr`, using native
  `BarcodeDetector` where available and the wasm decoder on iOS Safari, which has
  none. Loaded by dynamic `import()` **inside the GM route only**, so 294 players
  never download it. Camera needs HTTPS (CloudFront ✓) and `playsinline`.

Demo mode gets a local fake game so the whole thing is developable and
rehearsable without AWS, like every other service in the app.

### 6.4 Offline GM

Queue in `localStorage` (tiny, synchronous, survives a browser kill), a "N
pending" badge that's impossible to miss, and a `beforeunload` warning while it's
non-empty.

**Don't deploy the frontend during the game** — `registerType: 'autoUpdate'` in
[vite.config.ts](../vite.config.ts) will pull a new service worker under the GMs'
feet mid-game.

---

## 7. The two scripts (`infra/scripts/`)

Both talk to DynamoDB directly via boto3 — never through the API.

**`start_game.py`**
```bash
python start_game.py                 # health 100, pace 1.0, status running
python start_game.py --pace 0.6      # start at a different pace
python start_game.py --health 100    # explicit starting life points
python start_game.py --reset         # zero scores + clear ledger (rehearsal)
python start_game.py --end           # stop the game
```
Seeds all 30 team scores to 0, sets `world_health`, `last_tick_ms`, and flips
`status` to `running`. No fixed duration — the game runs until you end it or
health reaches 0.

**`set_pace.py`**
```bash
python set_pace.py 1.6      # from now on, 1.6 life points per minute
python set_pace.py 0        # freeze the meter
python set_pace.py --status # health, pace, elapsed, projected minutes to zero
```
`--status` is what you'll watch during the game: it prints how many minutes are
left at the current pace, so you can steer it live.

---

## 8. Gotchas to handle in code

1. **DynamoDB returns `Decimal` and `json.dumps` chokes on it.** `world_health`
   and `pace` are floats, so this *will* bite — the existing lambdas dodge it by
   only handling ints. Add a `default=` encoder to `util.py`'s `json_response`.
   Keep world points as whole integers so only health and pace are fractional.
2. **DynamoDB map keys are strings** — `scores` is keyed `"1"`…`"30"`.
3. `ExpressionAttributeNames` is required for the dynamic `scores.#t` path.
4. **Tick Lambda needs `Timeout: 60`** — the `Globals` block sets 10 s, and the
   30 s cadence sleeps.
5. `deploy-backend.yml` hard-fails when the Twilio secrets are missing; if the
   new resources add SAM parameters, they need adding to `--parameter-overrides`
   there too.

---

## 9. What shipped

**Backend** — [game_state.py](../infra/lambda/game_state.py) (shared rules, no
boto3, unit-tested), [game.py](../infra/lambda/game.py) (3 routes),
[tick.py](../infra/lambda/tick.py) (decay + queue drain),
[util.py](../infra/lambda/util.py) (Decimal encoder),
[template.yaml](../infra/template.yaml) (2 tables, FIFO queue, 2 functions,
schedule).

**Scripts** — [start_game.py](../infra/scripts/start_game.py),
[set_pace.py](../infra/scripts/set_pace.py).

**Frontend** — `src/game/` (shell, meter, standings, player tab, QR, game
master award + history, offline queue, scanner),
[game.ts](../src/services/game.ts), [demo/game.ts](../src/demo/game.ts),
[useEventTheme.ts](../src/utils/useEventTheme.ts), dark tokens in
[styles.css](../src/styles.css), `game.*` strings in all three locales.

### Verified

- 24 unit tests on the decay maths, ranking and role resolution
  (`cd infra/lambda && python -m unittest test_game_state`).
- QR round-trip: the encoder's output decoded back through the scanner's
  decoder for teams 1, 7 and 30 — 21-module (version 1) codes, the least dense
  and so the easiest to read in sunlight.
- Driven in headless Chrome as player, spectator and game master with the clock
  shifted into the field-games window: dark mode engages, the card becomes a
  door, the meter renders and recolours, standings carry **no points in any
  row**, an award queues and applies, and an overdraft is refused and shown
  with no resend button.

### Still to do before the day

**Rehearse with real phones**, including airplane mode on a game master's
device. The offline queue is the one part that cannot be debugged live in a
field. `start_game.py --reset` afterwards clears the rehearsal.

---

## 10. Notes for the day

- **`--status` is the dial to watch.** `python set_pace.py --status` prints
  health, pace and projected minutes to collapse. Steer from that.
- **Don't deploy the frontend mid-game** — `registerType: 'autoUpdate'` will
  pull a new service worker under the game masters' feet.
- **Sacrifices land within a minute.** Team points apply instantly; world points
  ride the queue and appear on the next tick. If that wait feels too long on the
  day, the `Schedule` on `TickFn` is the only thing to change.
- **A blocked FIFO group self-heals.** If a world-points message fails to apply
  it stays in flight for 60s, holding up the ones behind it; the next tick
  clears the backlog.
- **Set an AWS Budget alert at $5.** Expected spend is ~$0.50; the only
  unbounded risk is a client retry loop, and the alert is the backstop.


---

## 11. The world, rendered

The meter is a three.js planet, not a progress bar. Colour alone carries the
reading, on this ramp (`src/game/healthColor.ts`):

| Health | Colour | Readout |
|---|---|---|
| 100 | emerald | Stable |
| 78 | cyan-blue | Strained |
| 58 | **ash** | Strained |
| 40 | yellow | Degrading |
| 22 | orange | Degrading |
| 0 | red | Critical → Collapsed |

The ash stop is an addition. Blue to yellow passes through grey under *any*
smooth interpolation, and without an explicit stop the midpoint lands on a muddy
grey-green that reads as a rendering bug. Making it deliberate turns it into the
story — the world drains of colour before it starts to burn. One line to remove
if you disagree.

The same colour drives every accent in the game (`--fo-accent` / `--fo-rgb` on
`.fo-root`), so the whole panel drifts with the planet.

**The world** is a lat/long wireframe cage with its continents picked out in
points, a slow churning fog inside it, and a halo that hardens as health falls.
The percentage sits over the middle of the globe; the status line reads beneath
it. Every few seconds the feed glitches — the globe jerks and the panel tears
with a chromatic split — more often and more violently the worse things get.

**At zero it stops.** The world goes grey, the halo dies, rotation and fog and
glitching all cease, and the render loop parks itself: measured at **4 draw
calls total** after collapse, versus ~830 over the same span while alive. A dead
world costs nothing.

The surrounding panel is the app's own soft UI in the dark — one surface colour,
raised controls, recessed inputs, pressed-in active tab — with monospace
readouts and HUD brackets over it.

**Cost and guards.** three.js is 190 KB gzip in its own lazy chunk — it never
blocks first paint, and the service worker precaches it, so it is warm long
before the game (players use this app all week). Then:

- 30fps cap — the planet turns slowly and this halves the GPU work.
- Pixel ratio capped at 1.75.
- Rendering stops entirely while the tab is hidden.
- `prefers-reduced-motion` stops the rotation.
- No WebGL (old device, low-power mode) falls back to a CSS orb on the same
  colour, so the reading survives.

Measured at 51fps uncapped under **software rendering** with no GPU at all,
which is the floor no real phone will be near.

**Rehearsing the end states**: `localStorage['bcn2026-demo-health'] = '8'` in
demo mode starts the world anywhere on the curve, so you can see the collapse
without waiting an hour.
