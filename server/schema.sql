-- =============================================================================
-- Local SQLite schema — ported from the Postgres migrations.
--
-- Same five tables, same constraints, same guarantees. What changes:
--
--   * uuid       -> TEXT holding a uuid string (generated with crypto.randomUUID)
--   * timestamptz-> TEXT holding ISO-8601 UTC ('2026-09-06T09:15:32.000Z')
--   * date       -> TEXT 'YYYY-MM-DD'
--   * RLS        -> there is no RLS in SQLite. Authorisation moves into the
--                   API layer (server/auth.js), which is now the ONLY thing
--                   that talks to this file. The constraints below are still
--                   the last line of defence and are unchanged in strength.
--   * triggers that rewrote NEW  -> SQLite cannot modify NEW in a BEFORE
--                   trigger, so the provenance stamp (person_number,
--                   person_name, timestamps) is applied by an INSERT..SELECT
--                   in the attendance route, which reads them from the
--                   directory in the same statement. Eligibility is enforced
--                   by that statement's JOIN rather than by a trigger.
-- =============================================================================

pragma journal_mode = wal;   -- readers never block the writer
pragma foreign_keys = on;    -- off by default in SQLite; the FKs below need it

create table if not exists people (
  id            text primary key,
  person_number text not null unique check (length(trim(person_number)) > 0),
  name          text not null check (length(trim(name)) > 0),
  active        integer not null default 1 check (active in (0, 1)),
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists meetings (
  id           text primary key,
  meeting_code text not null unique
               check (meeting_code = upper(trim(meeting_code)))
               check (meeting_code glob '[A-Z0-9]*'),
  meeting_name text not null check (length(trim(meeting_name)) > 0),
  description  text,
  active       integer not null default 1 check (active in (0, 1)),
  created_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Who may attend what. Deleting a meeting or a person clears their
-- assignments; the unique pair stops a double assignment.
create table if not exists meeting_participants (
  id         text primary key,
  meeting_id text not null references meetings(id) on delete cascade,
  person_id  text not null references people(id)   on delete cascade,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (meeting_id, person_id)
);

create index if not exists meeting_participants_person_idx
  on meeting_participants (person_id);

-- The append-only check-in log.
--
-- `on delete restrict` is what makes "delete if safe" work: Postgres refused to
-- delete a meeting or person with check-ins against it, and SQLite refuses the
-- same way. person_number/person_name are a snapshot, so a later rename in the
-- directory cannot rewrite history.
create table if not exists attendance (
  id              text primary key,
  meeting_id      text not null references meetings(id) on delete restrict,
  person_id       text not null references people(id)   on delete restrict,
  person_number   text not null,
  person_name     text not null,
  attendance_date text not null,
  attended_at     text not null,
  created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- THE attendance rule: one check-in per person, per meeting, per day.
  unique (meeting_id, person_id, attendance_date)
);

create index if not exists attendance_date_idx on attendance (attendance_date);
create index if not exists attendance_meeting_idx on attendance (meeting_id);

-- Administrators. Local accounts only: a scrypt hash, no third party, no keys.
create table if not exists admin_users (
  id            text primary key,
  email         text not null unique,
  password_hash text not null,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Login sessions, so a restart of the server does not sign everyone out.
create table if not exists sessions (
  token      text primary key,
  admin_id   text not null references admin_users(id) on delete cascade,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at text not null
);
