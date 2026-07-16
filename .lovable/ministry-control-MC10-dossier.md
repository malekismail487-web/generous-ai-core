# Ministry Control · MC10 Dossier — National Communication

**Phase:** MC10 · **Migration:** `20260716_ministry_control_mc3_mc11.sql`
**Panel:** `src/components/ministry/control/CommunicationsPanel.tsx`

---

## Purpose

Give the ministry a governed channel for publishing announcements,
curriculum updates, and educational notices to every school user inside its
tenant. MC10 routes notice publication through the MC2 pipeline so every
national broadcast is auditable.

## Reused data model

MC10 reuses the existing `ministry_announcements` table (introduced in T4)
rather than duplicating it. This preserves the read-side surfaces
(`useMinistryAnnouncements` hook, existing display components) unchanged.

The MC2 pipeline replaces the previous direct-write path as the
recommended way for ministries to broadcast; the older
`MinistryAnnouncementsEditor` in the Super Admin panel remains for
Super Admin emergency use.

## Applier

**`communication.notice` → `apply_national_notice_change`**

Payload: `{ title, body, severity? }`. Inserts a new row with
`published=true` and stamps `published_at=now()`. Severity defaults to
`info` and is validated by convention against `info | warning | critical`
in the UI layer.

## Read RPC

- `list_mc_notices(p_session_token)` — returns the last 100 notices for the
  caller's tenant, ordered newest-first.

## UI (`CommunicationsPanel`)

Feed-style layout: draft dialog at the top, each notice rendered as a card
with severity badge, title, timestamp, and body. Deliberately minimal — the
audit log holds the "who edited what and when" story; this panel is for
authoring and quick review.

## Non-goals for MC10

- No targeting by grade, subject, region, or role — every notice is
  broadcast to the tenant. Targeted communication (e.g. "Grade 10 teachers
  only") is planned when the messaging domain expands, likely alongside a
  read-receipt table.
- No rich-text editor. Notices are plain text preserved via
  `whitespace-pre-wrap`.
- No scheduled publication — a notice is drafted, reviewed, and published
  immediately by the pipeline. Scheduled posts would need a `scheduled_at`
  column and a background dispatcher, both out of scope for MC10.
