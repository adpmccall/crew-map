-- submission_notifications.sql — email me when someone submits a crew.
--
-- THE PROBLEM
--   Submissions land in `crew_submissions` as 'pending' and sit there until
--   someone remembers to run `select * from pending_submissions`. For a feature
--   whose whole point is organic growth, a real submission going unnoticed for
--   three weeks is a quiet failure: the person who bothered gets no response,
--   and the map doesn't grow.
--
-- WHY THIS SHAPE
--   A Postgres trigger calls Resend's API directly through `pg_net`. Considered
--   and rejected:
--     * Supabase Edge Function — the documented pattern, but the code would live
--       outside this repo and need the Supabase CLI to deploy. Everything else
--       here is version-controlled and reviewable; this would not be.
--     * A Next.js API route — would work, but adds the project's FIRST API
--       route. Part of why the Next.js advisories were assessed "not exploitable
--       here" is that this app has none, and an inbound webhook endpoint is a
--       new public attack surface to secure. Not worth it for an email.
--     * Polling from the existing GitHub Action — free and simple, but daily
--       latency, and it would mean signalling good news through a red build.
--   This adds ONE service (Resend) and no new code deployment path.
--
-- COST: $0. Resend's free tier is 3,000 emails/month and 100/day, no card
--   required. Expected volume here is single digits per week at most.
--
-- SAFE TO RE-RUN.
--
--
-- ============================================================================
-- BEFORE YOU RUN THIS — two things to set up
-- ============================================================================
--
-- 1. Get a Resend API key (free, no card):
--      a. Sign up at https://resend.com with the email you want alerts sent TO.
--      b. API Keys -> Create API Key. Name it something like "crew-map".
--         Permission "Sending access" is enough.
--      c. Copy the key (starts with `re_`). It's shown once.
--
--    NOTE ON THE FROM ADDRESS: this uses Resend's `onboarding@resend.dev`,
--    which needs NO domain verification — but it can only send to the email
--    address that owns the Resend account. That's exactly what we want here
--    (alerts to you, nobody else), so it's a feature rather than a limitation.
--    If you later want alerts from something like alerts@usfiremaps.com, verify
--    the domain in Resend and change FROM_ADDRESS in the function below.
--
-- 2. Store the key and your address in Supabase Vault, so they're encrypted at
--    rest rather than sitting in a function body. Run these TWO statements with
--    your real values (this file never contains them):
--
--      select vault.create_secret('re_YOUR_KEY_HERE', 'resend_api_key');
--      select vault.create_secret('you@example.com',  'notify_email');
--
--    To change one later:
--      select vault.update_secret(
--        (select id from vault.secrets where name = 'resend_api_key'),
--        're_NEW_KEY');
--
-- Then run the rest of this file.
-- ============================================================================


-- pg_net does the outbound HTTP. It's async: it queues the request and returns
-- immediately, so a slow or dead Resend can never hold up an INSERT.
create extension if not exists pg_net with schema extensions;


create or replace function notify_new_submission()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  api_key    text;
  to_address text;
  from_address constant text := 'Crew Map <onboarding@resend.dev>';
  subject    text;
  body_html  text;
  where_txt  text;
  crew_txt   text;
begin
  -- Read the secrets. If either is missing we simply don't send — a
  -- half-configured mailer must never cost us a real submission.
  select decrypted_secret into api_key
    from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  select decrypted_secret into to_address
    from vault.decrypted_secrets where name = 'notify_email' limit 1;

  if api_key is null or to_address is null then
    raise warning 'notify_new_submission: vault secrets not set, skipping email';
    return new;
  end if;

  -- Two kinds of submission arrive on this table and they need different
  -- emails: a new crew is judged on what it says, a correction is judged
  -- against a crew already on the map. Sending one generic mail for both meant
  -- squinting at every alert to work out which it was.
  if new.submission_kind = 'correction' then
    -- Pull the crew's current name so the subject line is useful on a phone
    -- lock screen. The join is cheap and this runs once per submission.
    select coalesce(c.crew_name, c.district, c.forest, '(unnamed)')
      into crew_txt
      from crews c where c.id = new.crew_id;

    subject := 'Correction reported: ' || coalesce(crew_txt, 'crew ' || new.crew_id);

    body_html :=
      '<p><strong>Correction to ' || coalesce(crew_txt, 'a crew') ||
        '</strong> (crew id ' || coalesce(new.crew_id::text, '?') || ')</p>' ||
      '<p>' || coalesce(new.notes, '(no detail given)') || '</p>' ||
      '<p>From: ' || coalesce(new.submitter_email, '?') || '</p>' ||
      '<p>Review it:<br>' ||
      '<code>select * from pending_corrections;</code><br>' ||
      'Fix the crew by hand, then:<br>' ||
      '<code>select resolve_correction(' || new.id || ');</code></p>';
  else
    where_txt := coalesce(new.town, '?') || ', ' || coalesce(new.state, '?');
    subject := 'New crew submission: ' || coalesce(new.crew_name, 'unnamed');

    -- Plain and scannable. The point is to tell you something arrived and give
    -- you enough to judge whether it needs attention now or can wait.
    body_html :=
      '<p><strong>' || coalesce(new.crew_name, 'unnamed') || '</strong><br>' ||
      coalesce(new.agency, '?') || ' &middot; ' || where_txt || '</p>' ||
      '<p>' ||
        'Crew type: ' || coalesce(new.resource, 'not given') || '<br>' ||
        'Website: '   || coalesce(new.website,  'not given') || '<br>' ||
        'Notes: '     || coalesce(new.notes,    'none')      || '<br>' ||
        'From: '      || coalesce(new.submitter_email, '?')  ||
      '</p>' ||
      case when new.latitude is null
        then '<p><em>No coordinates — this one will not appear on the map until ' ||
             'they are filled in.</em></p>'
        else '' end ||
      '<p>Review the queue:<br>' ||
      '<code>select * from pending_submissions;</code><br>' ||
      '<code>select approve_submission(' || new.id || ');</code></p>';
  end if;

  -- Fire and forget. pg_net queues this; the transaction does not wait on it.
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || api_key),
    body    := jsonb_build_object(
                 'from',    from_address,
                 'to',      jsonb_build_array(to_address),
                 'subject', subject,
                 'html',    body_html)
  );

  return new;

exception when others then
  -- BELT AND BRACES. Nothing in here is worth losing a submission over: if the
  -- extension is missing, the vault is unreadable, or the payload is malformed,
  -- swallow it and let the INSERT succeed. A lost email is recoverable by
  -- checking the queue; a lost submission is not.
  raise warning 'notify_new_submission failed: %', sqlerrm;
  return new;
end;
$$;

-- AFTER INSERT, not BEFORE: the row should exist before we announce it.
drop trigger if exists notify_new_submission_trg on crew_submissions;
create trigger notify_new_submission_trg
  after insert on crew_submissions
  for each row execute function notify_new_submission();

-- Only the definer needs to run this; nothing public should be able to.
revoke all on function notify_new_submission() from public, anon, authenticated;


-- ============================================================================
-- TESTING IT
-- ============================================================================
-- Insert a fake submission, confirm the email arrives, then remove it. The
-- rollback leaves no trace but ALSO cancels the queued email, so run it for
-- real and clean up afterwards instead:
--
--   insert into crew_submissions
--     (crew_name, agency, state, town, submitter_email, resource)
--   values
--     ('Notification Test', 'usfs', 'MONTANA', 'Missoula',
--      'test@example.com', 'Engine');
--
--   -- email should arrive within a few seconds, then:
--   delete from crew_submissions where crew_name = 'Notification Test';
--
-- And the correction variant (needs crew_corrections_schema.sql to have run;
-- swap 1 for a real crews.id):
--
--   insert into crew_submissions
--     (submission_kind, crew_id, notes, submitter_email)
--   values
--     ('correction', 1, 'The website on this one is dead.',
--      'test@example.com');
--
--   delete from crew_submissions where submitter_email = 'test@example.com';
--
-- IF NO EMAIL ARRIVES, check in this order:
--
--   -- 1. Did the request actually go out, and what came back?
--   select id, created, status_code, content
--     from net._http_response order by created desc limit 5;
--      401 -> bad API key.  422 -> Resend rejected the payload (usually the
--      'to' address isn't the one that owns the Resend account, which
--      onboarding@resend.dev requires).
--
--   -- 2. Are the secrets actually stored?
--   select name from vault.decrypted_secrets
--    where name in ('resend_api_key','notify_email');
--
--   -- 3. Did the trigger warn about anything? Check Logs -> Postgres in the
--   --    Supabase dashboard for 'notify_new_submission'.
--
-- TO TURN NOTIFICATIONS OFF without removing anything:
--   alter table crew_submissions disable trigger notify_new_submission_trg;
-- And back on:
--   alter table crew_submissions enable trigger notify_new_submission_trg;
