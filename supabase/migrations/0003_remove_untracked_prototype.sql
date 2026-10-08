-- Removes an admin prototype (key-based admin login, per-company manage tokens,
-- job-run bookkeeping) that was applied to the hosted database but never
-- committed. All of its tables were empty. It is replaced by 0004_accounts
-- (Supabase Auth admins and owners) and the feature migrations after it.
-- Every statement is guarded, so on a fresh database this is a no-op.

drop function if exists public.admin_add_source(text, text, text, text, text[]);
drop function if exists public.admin_approve_claim(text, bigint);
drop function if exists public.admin_create_org_from_submission(text, bigint, text, jsonb);
drop function if exists public.admin_list_requests(text, text, int);
drop function if exists public.admin_login_check(text, boolean);
drop function if exists public.admin_publish_event(text, bigint, jsonb);
drop function if exists public.admin_set_request_status(text, bigint, text);
drop function if exists public.admin_stats(text);
drop function if exists public.admin_unpublish_event(text, bigint);
drop function if exists public.admin_update_org(text, text, jsonb);
drop function if exists public.manage_get(text);
drop function if exists public.manage_update(text, jsonb);
drop function if exists public.job_try_start(text, interval);
drop function if exists public._assert_admin(text);
drop function if exists public._valid_http_url(text);
drop function if exists public._apply_profile_changes(text, jsonb, text);

drop view if exists public.jobs_public;
drop view if exists public.events_public;

drop table if exists public.admin_keys;
drop table if exists public.admin_login_attempts;
drop table if exists public.manage_tokens;
drop table if exists public.profile_changes;
drop table if exists public.job_runs;

-- Restore the public view to its tracked shape before dropping the columns it used.
drop view if exists public.organizations_public;
create view organizations_public with (security_invoker = true) as
select
  o.slug, o.name, o.kind, o.sectors, o.status, o.one_liner, o.website,
  o.founded_year, o.acquired_by, o.municipality, o.area, o.location_precision,
  case when o.location_precision in ('exact','building') then o.address end as address,
  -- exact/building: the address pin; area: the sector centroid; municipality: no pin
  case when o.location_precision in ('exact','building') then extensions.st_x(o.location::extensions.geometry)
       when o.location_precision = 'area' then extensions.st_x(a.center::extensions.geometry) end as lng,
  case when o.location_precision in ('exact','building') then extensions.st_y(o.location::extensions.geometry)
       when o.location_precision = 'area' then extensions.st_y(a.center::extensions.geometry) end as lat,
  o.funding_note,
  coalesce((select array_agg(r.to_slug) from relationships r where r.from_slug = o.slug), '{}') as connected_to,
  o.hiring,
  case when o.job_board_provider is not null
       then jsonb_build_object('provider', o.job_board_provider, 'handle', o.job_board_handle) end as job_board,
  o.verification,
  coalesce((select jsonb_agg(jsonb_build_object('url', s.url, 'note', s.note, 'fields', s.fields, 'retrieved', s.retrieved) order by s.id)
            from sources s where s.org_slug = o.slug), '[]') as sources,
  to_char(o.updated_at, 'YYYY-MM-DD') as updated_at
from organizations o
left join areas a on a.slug = o.area
where o.published;
grant select on organizations_public to anon, authenticated;

alter table organizations drop column if exists logo_url;
alter table organizations drop column if exists job_board_checked_at;
alter table organizations drop column if exists claimed_at;
alter table organizations drop constraint if exists job_board_handle_safe;
alter table events drop constraint if exists events_url_http;
alter table events drop column if exists ends_at;
alter table events drop column if exists city;
alter table events drop column if exists organizer;
alter table events drop column if exists description;
alter table events drop column if exists created_at;

-- Restore submit_request() to the tracked 0002 version.
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
begin
  if p_type not in ('submit','edit','claim','removal') then
    raise exception 'invalid request type';
  end if;
  if p_type <> 'submit' and not exists (select 1 from organizations where slug = p_org_slug and published) then
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

  -- Claims: flag whether the email is on the organisation's own domain (a reviewer still approves).
  if p_type = 'claim' then
    select website into v_website from organizations where slug = p_org_slug;
    v_email_domain := lower(split_part(p_contact, '@', 2));
    v_site_domain := lower(regexp_replace(coalesce(v_website, ''), '^https?://(www\.)?([^/]+).*$', '\2'));
    v_domain_match := v_site_domain <> '' and (v_email_domain = v_site_domain or v_email_domain like '%.' || v_site_domain);
  end if;

  insert into review_queue (type, org_slug, payload, contact, domain_match, source_ip_hash)
  values (p_type, case when p_type = 'submit' then null else p_org_slug end, p_payload, lower(p_contact), v_domain_match, p_ip_hash)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_request(text, text, jsonb, text, text) from public;
grant execute on function public.submit_request(text, text, jsonb, text, text) to anon, authenticated;
