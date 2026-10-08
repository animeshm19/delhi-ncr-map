-- Events calendar: anyone can suggest an event, a reviewer publishes it.
-- Published events feed /events, /this-week, /events.ics and /feed.xml.

alter table events add column if not exists ends_at timestamptz;
alter table events add column if not exists city text not null default 'Gurugram';
alter table events add column if not exists organizer text;
alter table events add column if not exists description text;
alter table events add column if not exists created_at timestamptz not null default now();
alter table events add column if not exists request_id bigint references review_queue(id) on delete set null;
alter table events add constraint events_title_len check (length(title) between 1 and 160);
alter table events add constraint events_url_http check (url ~* '^https?://[^\s<>"]+$' and length(url) <= 300);
alter table events add constraint events_times check (ends_at is null or (ends_at >= starts_at and ends_at <= starts_at + interval '7 days'));
alter table events add constraint events_description_len check (description is null or length(description) <= 1000);
create index if not exists events_starts_at on events (starts_at) where published;

-- Accept "event" suggestions (organisation-less, like new submissions).
create or replace function public.submit_request(
  p_type text,
  p_org_slug text,
  p_payload jsonb,
  p_contact text,
  p_ip_hash text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_website text;
  v_domain_match boolean := null;
  v_email_domain text;
  v_site_domain text;
  v_standalone boolean := p_type in ('submit', 'event');
begin
  if p_type not in ('submit','edit','claim','removal','event') then
    raise exception 'invalid request type';
  end if;
  if not v_standalone and not exists (select 1 from organizations where slug = p_org_slug and published) then
    raise exception 'unknown organisation';
  end if;
  if p_contact is null or length(p_contact) > 200 or p_contact !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or length(p_payload::text) > 6000 then
    raise exception 'request is too long';
  end if;

  -- Rate limits: 5 per email per hour, 10 per client per hour, 300 in total per hour.
  if (select count(*) from review_queue where contact = lower(p_contact) and created_at > now() - interval '1 hour') >= 5
     or (p_ip_hash is not null and (select count(*) from review_queue where source_ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 10)
     or (select count(*) from review_queue where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'too many requests, try again later';
  end if;

  if p_type = 'claim' then
    select website into v_website from organizations where slug = p_org_slug;
    v_email_domain := lower(split_part(p_contact, '@', 2));
    v_site_domain := lower(regexp_replace(coalesce(v_website, ''), '^https?://(www\.)?([^/]+).*$', '\2'));
    v_domain_match := v_site_domain <> '' and (v_email_domain = v_site_domain or v_email_domain like '%.' || v_site_domain);
  end if;

  insert into review_queue (type, org_slug, payload, contact, domain_match, source_ip_hash)
  values (p_type, case when v_standalone then null else p_org_slug end, p_payload, lower(p_contact), v_domain_match, p_ip_hash)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_request(text, text, jsonb, text, text) from public;
grant execute on function public.submit_request(text, text, jsonb, text, text) to anon, authenticated;

-- Publish an event suggestion. Times are timestamptz (the form sends IST offsets).
create or replace function public.admin_publish_event(p_request_id bigint, p_event jsonb) returns bigint
language plpgsql security definer set search_path = public, private as $$
declare
  v_admin text := private.require_admin();
  r review_queue := private.pending_request(p_request_id, 'event');
  v_title text := private.clean_text(p_event->>'title', 160);
  v_url text := private.clean_url(p_event->>'url');
  v_start timestamptz;
  v_end timestamptz;
  v_area text := nullif(p_event->>'area', '');
  v_id bigint;
begin
  if v_title is null then raise exception 'a title is required'; end if;
  if v_url is null then raise exception 'a link to the event page is required'; end if;
  begin
    v_start := (p_event->>'starts_at')::timestamptz;
    v_end := nullif(p_event->>'ends_at', '')::timestamptz;
  exception when others then
    raise exception 'invalid date';
  end;
  if v_start is null then raise exception 'invalid date'; end if;
  if v_start < now() - interval '1 day' or v_start > now() + interval '2 years' then raise exception 'event date is out of range'; end if;
  if v_end is not null and (v_end < v_start or v_end > v_start + interval '7 days') then raise exception 'invalid end time'; end if;
  if v_area is not null and not exists (select 1 from areas where slug = v_area) then raise exception 'unknown area'; end if;

  insert into events (title, starts_at, ends_at, venue, area, city, url, organizer, description, published, request_id)
  values (v_title, v_start, v_end, private.clean_text(p_event->>'venue', 160), v_area,
          coalesce(private.clean_text(p_event->>'city', 60), 'Gurugram'), v_url,
          private.clean_text(p_event->>'organizer', 120), private.clean_text(p_event->>'description', 1000), true, p_request_id)
  returning id into v_id;
  perform private.close_request(p_request_id, 'approved', v_admin, null);
  perform private.audit(v_admin, 'publish_event', v_id::text, jsonb_build_object('request', p_request_id, 'title', v_title));
  return v_id;
end $$;

-- Take a published event down (spam, cancelled).
create or replace function public.admin_unpublish_event(p_event_id bigint) returns void
language plpgsql security definer set search_path = public, private as $$
declare
  v_admin text := private.require_admin();
begin
  update events set published = false where id = p_event_id;
  if not found then raise exception 'unknown event'; end if;
  perform private.audit(v_admin, 'unpublish_event', p_event_id::text, null);
end $$;

revoke all on function public.admin_publish_event(bigint, jsonb), public.admin_unpublish_event(bigint) from public, anon;
grant execute on function public.admin_publish_event(bigint, jsonb), public.admin_unpublish_event(bigint) to authenticated;
