-- notify_submitter_approved.sql — thank people when their submission/correction goes live.
--
-- ============================================================================
-- PREREQUISITE — READ THIS FIRST, this file will silently do nothing without it
-- ============================================================================
--   submission_notifications.sql (the existing owner-alert trigger) sends FROM
--   onboarding@resend.dev, Resend's shared sandbox address. That address can
--   ONLY deliver to the email that owns the Resend account — a deliberate
--   Resend restriction so an unverified sender can't be used to spam strangers.
--   It CANNOT reach submitter_email values, which are real third-party addresses.
--
--   Before this file will actually send anything:
--     1. In Resend: Domains -> Add Domain -> usfiremaps.com, or a subdomain like
--        updates.usfiremaps.com if you'd rather leave the root domain's DNS alone.
--     2. Add the SPF/DKIM TXT records Resend gives you, wherever the domain's DNS
--        is managed. usfiremaps.com has no other mail configured today (the real
--        inbox, usfiremaps@gmail.com, is a different domain) — clean addition.
--     3. Wait for Resend to mark the domain Verified (usually minutes).
--     4. Change FROM_ADDRESS below to an address at your now-verified domain.
--   Still $0 — domain verification doesn't need a paid Resend plan.
--
--   Until then, this trigger will fire, try to send, get rejected by Resend, and
--   swallow the error (same belt-and-braces behavior as the existing trigger —
--   a mailer problem must never block a real approval). Check
--   `select * from net._http_response order by created desc limit 5;` if you
--   want to see the rejection while testing.
--
-- ============================================================================
-- WHAT THIS ADDS
-- ============================================================================
--   1. A new column, submitter_notified_at, so a submitter is never thanked
--      twice — the trigger below and the one-time catch-up script
--      (catchup_thank_approved_submitters.sql) both check and set it.
--   2. send_submitter_thankyou(id) — the actual "build the email and send it"
--      function, written once so both the live trigger and the one-time
--      catch-up script call the exact same logic.
--   3. A trigger that calls it automatically the moment a submission's status
--      flips TO 'approved' — via approve_submission() for a new crew, or
--      resolve_correction() for a correction. Two different messages, same
--      reasoning as the owner-alert trigger: being thanked for a new crew and
--      being thanked for a correction are different things.
--   4. A reply_to header pointing at usfiremaps@gmail.com on every send, so
--      anyone who hits "Reply" lands in the inbox you already check — not a
--      second inbox at the FROM_ADDRESS domain (which can't even receive mail
--      -- usfiremaps.com only has outbound sending set up, see the
--      prerequisite above). One inbox, branded outgoing address.
--
-- SAFE TO RE-RUN.


alter table crew_submissions
  add column if not exists submitter_notified_at timestamptz;


create or replace function send_submitter_thankyou(submission_id bigint)
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  s            crew_submissions%rowtype;
  api_key      text;
  from_address constant text := 'Crew Map <updates@usfiremaps.com>'; -- CHANGE to your verified Resend sender
  subject      text;
  body_html    text;
  crew_txt     text;
begin
  select * into s from crew_submissions where id = submission_id;
  if not found or s.submitter_email is null then
    return;
  end if;

  select decrypted_secret into api_key
    from vault.decrypted_secrets where name = 'resend_api_key' limit 1;

  if api_key is null then
    raise warning 'send_submitter_thankyou: resend_api_key not set, skipping email';
    return;
  end if;

  if s.submission_kind = 'correction' then
    select coalesce(c.crew_name, c.district, c.forest, '(unnamed)')
      into crew_txt
      from crews c where c.id = s.crew_id;

    subject := 'Thanks for the correction — ' || coalesce(crew_txt, 'the crew') || ' is updated';
    body_html :=
      '<p>Hey,</p>' ||
      '<p>Thanks for flagging something wrong with <strong>' ||
        coalesce(crew_txt, 'that crew') ||
        '</strong> on the Crew Map. I reviewed it and made the fix — ' ||
        'it''s live on the map now.</p>' ||
      '<p>Really appreciate you taking the time. If you spot anything else off, ' ||
        'or know of a crew that''s missing, the same form handles both:<br>' ||
        '<a href="https://usfiremaps.com/submit">usfiremaps.com/submit</a></p>' ||
      '<p>— Crew Map</p>';
  else
    crew_txt := coalesce(s.crew_name, 'your crew');

    subject := 'Thanks for submitting ' || crew_txt || ' — it''s live';
    body_html :=
      '<p>Hey,</p>' ||
      '<p>Thanks for submitting <strong>' || crew_txt || '</strong>! ' ||
        'Your info was valuable and it''s now live on the map:<br>' ||
        '<a href="https://usfiremaps.com/map">usfiremaps.com/map</a></p>' ||
      '<p>If you know of any other crews that are missing, or spot anything ' ||
        'wrong while you''re there, that same form handles both:<br>' ||
        '<a href="https://usfiremaps.com/submit">usfiremaps.com/submit</a></p>' ||
      '<p>— Crew Map</p>';
  end if;

  -- reply_to routes any reply the recipient sends back to the project's
  -- existing Gmail inbox, not to `from_address` (which nobody reads directly
  -- and can't receive mail anyway -- usfiremaps.com has no inbound mail
  -- setup, just an outbound-only verified sender). This keeps everything in
  -- ONE inbox: the email looks properly branded going out, but "Reply" comes
  -- straight back to you.
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || api_key),
    body    := jsonb_build_object(
                 'from',     from_address,
                 'to',       jsonb_build_array(s.submitter_email),
                 'reply_to', 'usfiremaps@gmail.com',
                 'subject',  subject,
                 'html',     body_html)
  );

  update crew_submissions set submitter_notified_at = now() where id = submission_id;

exception when others then
  raise warning 'send_submitter_thankyou(%) failed: %', submission_id, sqlerrm;
end;
$$;

revoke all on function send_submitter_thankyou(bigint) from public, anon, authenticated;
grant execute on function send_submitter_thankyou(bigint) to service_role;


create or replace function notify_submitter_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform send_submitter_thankyou(new.id);
  return new;
end;
$$;

-- WHEN clause does the real filtering: only the transition INTO approved,
-- never a re-save of an already-approved row and never a rejection.
drop trigger if exists notify_submitter_approved_trg on crew_submissions;
create trigger notify_submitter_approved_trg
  after update on crew_submissions
  for each row
  when (new.status = 'approved' and old.status is distinct from 'approved')
  execute function notify_submitter_approved();

revoke all on function notify_submitter_approved() from public, anon, authenticated;


-- ============================================================================
-- TESTING IT (after the domain is verified and FROM_ADDRESS is updated above)
-- ============================================================================
--   insert into crew_submissions
--     (crew_name, agency, state, town, submitter_email, resource)
--   values
--     ('Notification Test 2', 'usfs', 'MONTANA', 'Missoula',
--      'YOUR_OWN_EMAIL_HERE', 'Engine');
--
--   select approve_submission(
--     (select id from crew_submissions where crew_name = 'Notification Test 2'));
--
--   -- confirm the thank-you email arrives, then clean up:
--   delete from crews where id = (
--     select approved_crew_id from crew_submissions
--      where crew_name = 'Notification Test 2');
--   delete from crew_submissions where crew_name = 'Notification Test 2';
--
-- TO TURN THIS OFF without removing anything:
--   alter table crew_submissions disable trigger notify_submitter_approved_trg;
