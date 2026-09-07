# Meeting Attendance Tracking System

QR-code based attendance capture for recurring corporate meetings.
Each meeting has a stable public URL; scanning its QR code opens a form that
lists **only** the people eligible for that meeting, and a submission is written
to an append-only attendance log that can be exported to Excel.

Stack: **React 19 + TypeScript + Vite + Tailwind CSS v4 + Express + SQLite (libSQL)**.

The data lives in SQLite either way — as a file on your machine for local use,
or as a hosted [Turso](https://turso.tech) database for the Vercel deployment.
Same schema, same queries, same code; only `TURSO_DATABASE_URL` differs.

---

## 1. Getting started

### Prerequisites

Node.js 22.5+ (`node --version`). Nothing else for local use — no Docker, no
database server. Deploying additionally needs a free [Turso](https://turso.tech)
database and a Vercel account (see [section 5](#5-deployment)).

### Install and run locally

```bash
npm install
npm run db:push      # create the database file, schema and trial data
npm start            # build the frontend, then serve everything on :3000
```

With no `TURSO_DATABASE_URL` set, the data is a local SQLite file at
`data/attendance.db` — no account, no network, no configuration.

`db:push` seeds the trial meetings and roster from the brief, and creates a
first administrator if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set. There is
deliberately **no default password**: with none set it creates no account and
tells you to run `npm run admin`.

Open <http://localhost:3000>. Phones on the same Wi-Fi reach it at the
machine's LAN address (`http://192.168.x.x:3000`) — which is what the QR codes
need, since the point is to scan them from a phone.

### Development

Two processes: Vite serves the UI with hot reload, and the API runs beside it.
Vite proxies `/api` to the server, so everything stays same-origin and the
session cookie behaves exactly as it does in production.

```bash
npm run server       # the API + database, :3000
npm run dev          # the UI with hot reload, :5173
npm run dev -- --host    # also reachable from a phone on the same Wi-Fi
```

### Configuration

Nothing is required locally. `.env.example` documents what exists — the Turso
credentials, the office timezone, the first administrator, and the port. Copy
it to `.env.local` if you need any of them; both `npm run server` and
`npm run admin` read that file.

The one that matters in production is **`ATTENDANCE_TIMEZONE`**. It decides
which calendar day a check-in is filed under. Unset it is UTC, which is only
correct near Greenwich.

### Administrators

Accounts are rows in `admin_users`, created from the terminal:

```bash
npm run admin -- you@company.com a-real-password   # create, or reset a password
npm run admin -- --list                            # who can sign in
npm run admin -- --remove someone@company.com      # revoke access
```

These act on whichever database the environment points at, so setting the Turso
variables first is how you create the deployment's administrator.

### Verify the database

```bash
npm run db:verify
```

Twenty-nine assertions against a throwaway database in your temp folder: the
constraints, the attendance rule, the delete guards, every report, the session
lifecycle and the timezone handling. It touches neither your real data nor the
network, and takes about a second.

### All scripts

```bash
npm start         # build + serve everything on :3000
npm run server    # the API + database only
npm run dev       # the UI with hot reload, :5173
npm run build     # typecheck + production build into dist/
npm run db:push   # apply schema + seed to the target database
npm run admin     # manage administrator accounts
npm run lint      # oxlint
npm run db:verify # the assertion suite
```

---

## 2. Screens

| Route | Purpose |
| --- | --- |
| `/` | All meetings, loaded from the database |
| `/qr` | QR-code management: every meeting's name, code, QR, URL and PNG download |
| `/qr/print` | Printable sheet — one QR poster per meeting, one per page |
| `/qr/:meetingRef` | One meeting's QR code, plus the roster a scan will show |
| `/attendance/:meetingRef` | **The QR-code target** (e.g. `/attendance/A`) — the attendance form |
| `/m/:meetingRef` | Redirect to `/attendance/…`, so codes printed before the rename still scan |
| `/admin` | **Admin dashboard** — summary cards, per-meeting summary, filterable attendance table |
| `/admin/reports` | Daily, participant, meeting and date-range trend reports |
| `/admin/export` | Three-sheet Excel export |
| `/admin/meetings` | Meeting management: create, edit, activate/deactivate, delete-if-safe |
| `/admin/meetings/:id/participants` | "Manage Participants" — tick who is eligible |
| `/admin/people` | Participant directory: add, edit, activate/deactivate, search, delete-if-safe |

Everything under `/admin` requires a signed-in **administrator**. The pre-`/admin`
paths (`/dashboard`, `/reports`, `/records`) redirect to their new homes.

`meetingRef` is a `meeting_code` or a meeting uuid; the database resolves
either, and the frontend never parses it.

---

## 3. Architecture

### Data model

Four tables, deliberately kept separate so meetings, people and eligibility can
each change without touching the others:

```
meetings                         people
  id            uuid pk            id             uuid pk
  meeting_code  text UNIQUE  ◄──   person_number  text UNIQUE
  meeting_name  text          QR   name           text
  description   text          URL  active         bool
  active        bool               created_at / updated_at
  created_at / updated_at
        │                              │
        └──────────────┬───────────────┘
                       ▼
          meeting_participants              ← WHO MAY ATTEND WHAT
            id          uuid pk
            meeting_id  → meetings(id)   ON DELETE CASCADE
            person_id   → people(id)     ON DELETE CASCADE
            created_at
            UNIQUE (meeting_id, person_id)

          attendance                        ← WHAT ACTUALLY HAPPENED
            id              uuid pk
            meeting_id      → meetings(id)  ON DELETE RESTRICT
            person_id       → people(id)    ON DELETE RESTRICT
            person_number   text   ┐ snapshots, stamped by the server
            person_name     text   ┘
            attendance_date text   'YYYY-MM-DD', in ATTENDANCE_TIMEZONE
            attended_at     text   ISO-8601 UTC
            created_at      text
            UNIQUE (meeting_id, person_id, attendance_date)
```

Design decisions worth knowing:

- **`meeting_code` is the meeting's public identity.** The QR code encodes
  `<origin>/m/<meeting_code>` (`/m/A`). Because the code lives in the database,
  a printed poster keeps working forever — renaming a meeting or changing its
  roster never invalidates it. Codes are stored uppercase (a CHECK constraint
  enforces it) so `/m/a` and `/m/A` cannot become two different meetings.
- **Eligibility is a join table, not a column.** Adding someone to Meeting B is
  one row and no code change. A person can be in any number of meetings, and
  `UNIQUE (meeting_id, person_id)` prevents duplicate pairings.
- **`person_number` is `text`, not an integer.** It is an identifier, not a
  quantity — leading zeros have to survive.
- **Attendance snapshots the number and name.** A later rename or directory
  cleanup must not silently rewrite what a historical export says. That is also
  why its two foreign keys are `ON DELETE RESTRICT`: removing a person from the
  directory must not erase history.
- **The attendance rule is a database constraint**, not UI logic:
  `UNIQUE (meeting_id, person_id, attendance_date)`.
- **`attendance_date` is the *server's* local day.** SQLite's `date('now')`
  returns the UTC day, which rolls over mid-afternoon for offices east of
  Greenwich; `date('now','localtime')` gives the day the office is actually
  having. The machine sits in the same building as the meeting, so its calendar
  is the right one — and unlike a client-supplied date, a phone with a wrong
  clock cannot influence it.

SQLite has no `uuid`, `timestamptz` or `date` type, so ids are uuid strings,
timestamps are ISO-8601 UTC text, and dates are `YYYY-MM-DD` text — a format
that sorts and compares correctly as a string, which is why the range queries
need no conversion. The full mapping is documented at the top of
`server/schema.sql`.

### QR-code system

One meeting, one code. Everything is derived from the `meetings` row, so a
meeting inserted tomorrow gets a working QR code, URL, PNG download and print
poster on the next page load — there is no per-meeting registration step and no
hardcoded URL anywhere in `src/`.

```
meetings row ──► attendanceUrl(meeting_code)  ──► <origin>/attendance/A
                        │
                        ├─► <MeetingQrCode>   canvas, encodes ONLY that URL
                        ├─► useMeetingQr()    same URL + a PNG download
                        └─► /qr, /qr/print    a card / a poster per row
```

| Piece | File |
| --- | --- |
| URL + download filename | `src/utils/qr.ts` |
| Canvas → upscaled PNG | `src/utils/download.ts` |
| URL, canvas ref, download action | `src/hooks/useMeetingQr.ts` |
| The code itself | `src/components/MeetingQrCode.tsx` |
| Management card | `src/components/MeetingQrCard.tsx` |
| Screens | `src/pages/QrCodesPage.tsx`, `QrPrintPage.tsx`, `MeetingQrPage.tsx` |

**The code carries no participant data.** The encoded payload is the meeting's
attendance URL and nothing else — no names, no person numbers, no roster. A
photographed or forwarded code discloses only which meeting it opens; the
roster is fetched from the database after the scan, through
`get_meeting_roster`. Scanning meeting A's code can only ever reach meeting A's
form, because the meeting is resolved from the URL against the database.

The download is a whole-number upscale of the on-screen canvas with image
smoothing off (~1024 px), so every QR module stays a hard-edged block and the
PNG prints sharp. `/qr/print` renders outside the app shell and gives each
poster its own sheet via `break-after-page`, so the printed output carries no
navigation chrome.

By default codes encode the origin the app is served from, which is what you
want in production. Set `VITE_PUBLIC_SITE_URL` to print or download codes for
the live domain while running the app locally.

### Admin dashboard

Every figure is computed in SQL, never in the browser:

| Read model | Backs |
| --- | --- |
| `dashboardStats()` | the four summary cards, in one round trip |
| `meetingSummaries()` | eligible / attended-today / percentage per meeting |
| `attendanceRows(filters)` | the attendance table, filtered server-side |

All three live in `server/reports.js` and are reachable only under
`/api/admin`, which is mounted behind `requireAdmin`. Signed out they answer
`401`, not data — which is why `/admin` sits behind `RequireAuth`. That guard
only decides what the browser bothers to render; the server is the real
boundary.

Percentages are computed as `round(100 * attended / eligible, 2)`, and only
*active* people count as eligible — matching the rule the attendance insert
enforces, so a departed employee cannot drag a meeting's percentage down
forever.

Filters (meeting, date, person number, person name) become SQL predicates, with
`like` for the two text fields so partial, case-insensitive matches work.
Filtering server-side keeps the payload small once the log outgrows one screen.

Attendance status reads `Present` for every row because a row *is* the
check-in — absence is the lack of a row, not a stored status.

### Attendance form

`/attendance/:meetingRef` is what a scan opens. It shows the meeting name, one
dropdown of the people assigned to *that* meeting, and a submit button — sized
for a phone held one-handed (`text-base` on the select, because iOS Safari
zooms the page in on anything smaller).

The browser sends only *which meeting* and *which person*. Everything recorded
is stamped server-side: the date and time come from the server clock, and
`person_number` and `person_name` are read out of the directory by the same
statement that does the insert. A device with a wrong clock cannot misdate the
log, and a tampered client cannot forge a name.

Duplicates are prevented three times over: already-recorded people render as
disabled options, the submit handler drops re-entrant calls, and the unique
constraint on (meeting, person, date) is the real backstop — surfaced as
"Attendance has already been recorded for you today."

The confirmation is read back from the stored row rather than echoed from what
the form had in hand, so what a person sees is what was written.

### Management screens

`/admin/meetings` and `/admin/people` are what let an administrator run the
system without editing code or writing SQL. Every action writes through the
local API and reloads from it — there is no client-side copy of the
configuration to drift out of date.

**Who may write.** Everything under `/api/admin` requires a session cookie;
there is no other way to write. `attendance` is deliberately not among the
things those routes can modify: it stays append-only, with no update or delete
endpoint at all, so an admin can retire a meeting but cannot quietly rewrite
who attended it.

**Seeing inactive rows.** The public `GET /api/meetings` returns only active
meetings — that is what makes a deactivated meeting's QR code stop resolving —
while `GET /api/admin/meetings` returns all of them, so the screen meant to
reactivate a meeting can see it. Two endpoints rather than one query with a
flag, because the public one must never widen by accident.

**Delete if safe** needs no application logic. `attendance` references meetings
and people `ON DELETE RESTRICT`, so SQLite refuses to delete anything with
check-ins against it, while `meeting_participants` cascades. The admin list
endpoints carry `attendance_count` so the UI can disable the button in advance;
`server/errors.js` translates the refusal into a sentence if two admins race on
stale screens. The honest fix for a meeting with history is Deactivate, which
the message says.

**Assignment** is one request. The server works out the difference between the
ticked set and what is stored and applies it in a single transaction, so adding
one person does not delete and re-insert the rest — which would churn
`created_at` and briefly leave a live meeting with no eligible participants.

### Server-side integrity

Nothing the browser sends is trusted. Recording a check-in is a single
`INSERT .. SELECT` (`server/routes/public.js`) that:

1. reads `person_number` and `person_name` straight from the directory, so a
   tampered client cannot forge them;
2. joins through `meeting_participants`, so a person who is not an **active
   participant of that meeting** produces no row to insert — the request comes
   back `403` having written nothing;
3. stamps the date and time from the server clock.

Writing it as one statement rather than a check followed by an insert is what
makes it safe under concurrency: there is no window between the two in which
the roster could change.

`npm run db:verify` proves all three, plus the unique constraint that enforces
one check-in per person, per meeting, per day.

### Security model

The public form has to work for an anonymous visitor without that visitor being
able to harvest anything. There are exactly four endpoints outside the sign-in
wall (`server/routes/public.js`):

| Endpoint | Returns |
| --- | --- |
| `GET /api/meetings` | active meetings — code, name, description |
| `GET /api/meetings/:ref` | the one meeting behind a QR code, or `404` |
| `GET /api/meetings/:ref/roster` | only the people eligible for *that* meeting, each with an `already_attended` flag |
| `POST /api/attendance` | one validated check-in, and the confirmation for it |

What that leaves out is the point. There is no public way to read the employee
directory — a roster is only ever the roster of the one meeting that was asked
for, and it carries no ids beyond the one the form has to post back. There is
no public way to read the attendance log at all: to the outside world it is
write-only.

Everything else — the log, the full directory, the reports, all management —
sits under `/api/admin`, behind one middleware:

```js
app.use('/api/admin', requireAdmin, adminRouter);
```

This is the piece that replaced Row Level Security. RLS re-evaluated a
predicate per row inside Postgres; this is one gate on one path prefix. It is a
smaller thing to get right, and it is testable by curl: every admin route
without a cookie answers `401`.

No endpoint updates or deletes `attendance` — the log is append-only, and a
correction means editing the file with the server stopped, deliberately.

### Frontend layering

```
src/
├─ lib/
│  ├─ api.ts          The ONE fetch wrapper; /api, same-origin, cookies
│  ├─ env.ts          The single optional env var (QR origin)
│  └─ errors.ts       Fallback for anything that is not an API error
├─ types/database.ts   The shapes the API returns
├─ services/           The ONLY place that calls the API
│  ├─ meetings.service.ts     listMeetings, getMeetingByRef, getMeetingRoster
│  ├─ attendance.service.ts   submitAttendance, listAttendance
│  ├─ dashboard.service.ts    getDashboardStats, getMeetingSummaries, getAttendanceRows
│  ├─ admin.service.ts        meeting/person CRUD, participant assignment
│  └─ report.service.ts       Excel sheet data + the four report views
├─ hooks/              useAsync, useSession + thin per-resource wrappers
├─ pages/              One component per route
├─ components/         Presentational, no data access
└─ utils/              date, qr url + filename, png download, excel export

server/
├─ index.js            The Express app; also serves dist/ in production
├─ db.js               Opens the SQLite file and applies the schema
├─ schema.sql          The five tables and every constraint
├─ auth.js             scrypt hashing, sessions, the requireAdmin gate
├─ errors.js           Constraint failures → sentences for a person
├─ reports.js          Every read model and report query
├─ seed.js             Trial data + the first admin, on an empty database
├─ admin-cli.js        `npm run admin`
└─ routes/
   ├─ public.js        The four endpoints reachable without signing in
   ├─ auth.js          login / logout / me
   └─ admin.js         Everything behind the wall
```

The rule that keeps this scalable: **components never import `api`.**
They call hooks, hooks call services, services own the requests.

Meetings, people and eligibility are managed entirely through
`/admin/meetings` and `/admin/people` — the trial data in `server/seed.js` is a
starting point, not a fixture the code depends on, and it is only loaded into a
database that is completely empty.

Nothing about meetings, people or eligibility is hardcoded anywhere in `src/` —
the frontend has no knowledge of "Meeting A" or of Pratik, Saurabh and the rest.
Try it: `grep -ri "pratik\|saurabh\|980" src/` returns nothing.

### Attendance reports

`/reports` has four tabs, each backed by its own query in `server/reports.js`:

| Tab | Function | Shows |
| --- | --- | --- |
| Daily report | `reportDailyBreakdown` | every active meeting on one date: eligible, present, absent, % |
| Participant report | `reportParticipantSummary` | per person: eligible, attended, missed, % — searchable by number or name |
| Meeting report | `reportMeetingPeople` | one meeting: totals plus the present and absent lists |
| Date range | `reportDailyTrend` | attendance per day across the period |

**Two definitions of "a meeting happened", on purpose.** The daily report lists
every active meeting for the chosen date, so a meeting nobody attended shows
`Present 0 / Absent 4 / 0%` — which is the row an admin looking at one day
wants. The range-based reports (the trend, and the Excel summaries) instead
count *occurrences*: a (meeting, date) pair with at least one check-in. A
report over an open range cannot invent the days a meeting was meant to run, so
plotting quiet days as 0% would overstate what the data knows; a report for one
named day can. Adding a schedule table would collapse the two definitions into
one.

Percentages are rounded to two decimals (`83.33%`, `66.67%`) everywhere,
including the Excel sheets, so no screen disagrees with the workbook.

`Meetings Missed` is derived on screen as `eligible - attended` rather than
queried separately, so the three numbers cannot drift apart. In the meeting
report, "present" means checked in at least once in the period, while "total
attendance records" counts every check-in — for a recurring meeting the second
exceeds the first.

### Excel export

`src/utils/excel.ts` builds a real `.xlsx` in the browser with ExcelJS, loaded
through a dynamic `import()` so its ~1 MB writer stays out of the bundle a
phone downloads when it scans a QR code — the export only ever runs on an admin
screen. The file is named `meeting-attendance-YYYY-MM-DD.xlsx`.

The "Export Excel" panel on `/dashboard` covers four scopes, which are one
query with different bounds rather than four code paths:

| Scope | Filters sent |
| --- | --- |
| All attendance | none |
| A selected meeting | `meetingCode` |
| A selected date | `from` = `to` = that day |
| A date range | `from`, `to` |

Three sheets, each carrying a caption naming the filters it was built with:

| Sheet | Columns |
| --- | --- |
| Attendance Records | Date, Time, Meeting, Person Number, Person Name |
| Meeting Summary | Date, Meeting, Eligible Participants, Attended, Absent, Attendance Percentage |
| Participant Summary | Person Number, Person Name, Total Meetings Eligible, Total Meetings Attended, Attendance Percentage |

The two summaries are computed by `reportMeetingSummary` and
`reportParticipantSummary` on the server rather than by counting rows in the
browser.

**Read the percentages with two caveats.** There is no meeting *schedule* in
this system, so an occurrence is defined as a (meeting, date) pair with at
least one check-in — a meeting nobody attended is indistinguishable from one
that never happened, and contributes no row. And eligibility is read from the
*current* participant list, so moving someone into a meeting today changes what
last month's report says they were eligible for. Both would be fixed by a
schedule table and assignment history; neither is a bug you can see from the
spreadsheet, which is why they are written into `server/reports.js` too.

**Formatting choices.** Dates and times are written as preformatted strings
(`07-09-2026`, `09:15:32`) rather than Excel date serials: a serial is
interpreted against the *reader's* timezone, which would shift a 00:15 check-in
onto the previous day for a colleague opening the file abroad. Person numbers
are text so leading zeros survive. Percentages are numeric with a `0.0"%"`
format, so they display as `66.7%` but still sort and chart. Every sheet has a
frozen header and an autofilter.

## 4. Security notes

### Who is an administrator

An administrator is a row in `admin_users`: an email and a scrypt hash. There
is no other kind of account, so holding a session *is* being an administrator —
the two-step "signed in, and also an admin" check that the hosted version
needed has nothing left to distinguish.

Accounts are created from the terminal on the machine itself
(`npm run admin -- <email> <password>`), never through the browser. There is no
signup endpoint and no endpoint that writes `admin_users`, so a compromised
admin session cannot appoint more admins — it would need shell access to the
office machine, at which point the database file is the smaller problem.

Passwords are hashed with scrypt from Node's own `crypto` module: deliberately
slow, memory-hard, and — being built in — one less dependency that needs a
compiler. Sign-in compares in constant time, and answers "wrong email or
password" to both failures, because telling them apart tells an attacker which
addresses are real.

Sessions are a random 32-byte token in the `sessions` table, sent as an
`httpOnly`, `SameSite=Lax` cookie. `httpOnly` means no page script can read it,
which is a stronger position than the localStorage JWT it replaced. Removing an
administrator cascades their sessions away with them, so revoking access signs
that person out of every browser immediately rather than whenever a token
happens to expire.

The cookie is not marked `Secure`, because this runs over plain HTTP on an
office LAN with no certificate. On a network you do not trust, put it behind a
TLS terminator and add the flag.

### The public / admin boundary

| Actor | May do |
| --- | --- |
| anon (a phone that scanned a QR code) | read **active** meetings; read the roster of the one meeting it asked about; POST one validated attendance row |
| an administrator | read everything; manage meetings, people and eligibility |

No endpoint updates or deletes `attendance` — administrators included. The log
is append-only.

### What the server validates

The browser is never trusted. The attendance insert enforces, server-side:

| Rule | How it fails |
| --- | --- |
| Meeting reference must resolve | `404` unknown or inactive meeting |
| Meeting must be active | `404` — the lookup matches on `active` |
| Person must be eligible for *that* meeting | `403` — the join yields no row |
| Person must be active | `403` — same join |
| One check-in per person, per meeting, per day | `409` unique constraint |

`person_number`, `person_name`, `attendance_date` and `attended_at` are read
from the directory and the server clock, never from the request body — a POST
carrying `person_name: "FORGED NAME"` stores the real name, because the request
body has no field that could carry one.

### What replaced the keys

There are none. The browser holds no key, because there is nothing to
authenticate to but the server sitting behind the same origin; the built bundle
contains no secret of any kind, and there is no `service_role` key to leak
because there is no service. The one credential in the system is an
administrator's password, hashed on the machine that stores it.

`RequireAuth` and the nav links remain rendering decisions, not controls. The
server re-checks the session cookie on every single request, so editing the
client changes nothing about what it will hand over.

### Still open before a real rollout

- Anyone who can reach a QR URL can check in as any person on that meeting's
  roster — the system establishes *presence*, not *identity*. Closing that
  needs per-person authentication, which defeats the point of a wall poster.
- No rate limit on `POST /api/attendance` or on sign-in. On a LAN this is a
  smaller worry than it was on a public URL, but a lockout after repeated
  failed sign-ins would be cheap to add.
- `admin_users` is a flat list: every admin can do everything.
- Plain HTTP. Fine on a trusted office LAN, not beyond one.
- Backups are your responsibility: the data is one file, and nothing copies it
  for you.

## 5. Deployment

Deployed on Vercel, with the database on Turso. The two halves:

| Piece | Where it runs |
| --- | --- |
| `dist/` (the React app) | Vercel's CDN, as static files |
| `api/index.js` (the Express app) | a Vercel serverless function, handling `/api/*` |
| the database | Turso, over the network |

`vercel.json` routes `/api/*` to the function and everything else to
`index.html` — the second rule is what makes a scanned QR code work, since
`/attendance/A` is a client-side route with no file behind it.

### Why the database had to move

The local build wrote to a SQLite file next to the server. A serverless
function cannot: its filesystem is read-only, and containers are recycled
between requests, so a check-in written during one request would be gone by the
next. Turso is SQLite over the network, which is why the port changed so
little — the schema and nearly every query are unchanged; they are just awaited
now.

### First-time setup

```bash
# 1. Create the database (https://turso.tech, or the CLI)
turso db create meeting-attendance
turso db show meeting-attendance --url        # -> TURSO_DATABASE_URL
turso db tokens create meeting-attendance     # -> TURSO_AUTH_TOKEN

# 2. Apply the schema and seed it, from your machine
TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… ADMIN_EMAIL=you@example.com   ADMIN_PASSWORD=… npm run db:push
```

Then set these in **Vercel -> Project Settings -> Environment Variables**:

| Variable | Value |
| --- | --- |
| `TURSO_DATABASE_URL` | `libsql://…turso.io` |
| `TURSO_AUTH_TOKEN` | the token from above |
| `ATTENDANCE_TIMEZONE` | the office's zone, e.g. `Asia/Kolkata` |

`ATTENDANCE_TIMEZONE` matters more than it looks. Serverless functions run in
UTC, so without it an evening check-in in India is recorded against the
following day, and the "attendance today" figures disagree with the room.

Redeploy after setting them — environment variables are read at runtime, but a
running deployment does not pick up new ones.

### What deployment costs you

The app no longer works offline, and the attendance data now lives on someone
else's servers rather than in a file you hold. That is the trade Vercel
requires; the local path below still works unchanged if you want it back.

### Running it locally

Unchanged. With no `TURSO_DATABASE_URL` set, everything falls back to
`data/attendance.db`:

```bash
npm run db:push    # first time only
npm start          # build + serve on :3000
```

---

## 6. Operations runbook

### Manage administrators

`npm run db:push` creates the first one from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
There is no default password — an account with a known password on a database
reachable from the internet is a different proposition from one on an office
machine, so it refuses rather than guessing.

```bash
npm run admin -- you@company.com a-real-password   # create, or reset a password
npm run admin -- --list                            # who can sign in
npm run admin -- --remove someone@company.com      # revoke access
```

Removing an account signs that person out of every browser at once, since
sessions cascade with it. These act on whichever database the environment
points at — set the Turso variables to manage the deployment's accounts:

```bash
TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… npm run admin -- --list
```

### Back up the data

For the deployment, the data is in Turso:

```bash
turso db shell meeting-attendance .dump > backup-$(date +%F).sql
```

Locally it is a file: stop the server and copy `data/attendance.db` (plus the
`-wal` and `-shm` files beside it). Either way, back it up on a schedule —
nothing does it for you.

### Create a meeting

`/admin/meetings` → **New meeting**. Name, code (uppercase letters/digits, e.g.
`A` or `TEAM-1`), optional description, Active. The code becomes the QR URL, so
a new meeting has a working QR code immediately — nothing to register.

### Assign participants

`/admin/meetings` → **Manage Participants** on the meeting. Tick everyone
eligible, then **Save participants**. Only ticked, *active* people appear in
that meeting's attendance form. Add people first at `/admin/people`.

### Download QR codes

- One meeting: `/qr` → **Download QR (PNG)**, or **Details** for a larger view.
  The PNG is upscaled to ~1024 px so it prints sharp.
- All meetings: `/qr` → **Printable view** → **Print**. One poster per page,
  no navigation chrome.

The code encodes only `<origin>/attendance/<meeting_code>` — never any
participant data. To print codes for the production domain from a laptop
running the dev server, set `VITE_PUBLIC_SITE_URL`.

### Export Excel

`/admin/export` → pick a meeting (or all), pick a period (all dates / a single
date / a range) → **Export Excel**. Downloads
`meeting-attendance-YYYY-MM-DD.xlsx` with three sheets: Attendance Records,
Meeting Summary, Participant Summary.

### Take attendance

Scan the poster → the form opens on the meeting → pick your name → **Submit
Attendance** → confirmation showing meeting, number, name, date and time.
