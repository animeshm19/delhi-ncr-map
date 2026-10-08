-- Hiring board: open roles read daily from companies' public job boards
-- (Greenhouse, Lever, Ashby), plus a plain careers link for everyone else.
--
-- Writes come from a daily Vercel cron that calls ingest_jobs() with a shared
-- token. Only the token's SHA-256 is stored here, in a private table that the
-- API can't read. Set it once with:
--   insert into private.settings values ('ingest_token_sha256', encode(sha256(convert_to('<token>', 'UTF8')), 'hex'))
--   on conflict (key) do update set value = excluded.value;

create table if not exists private.settings (
  key   text primary key,
  value text not null
);
revoke all on private.settings from public, anon, authenticated;

alter table organizations add column if not exists careers_url text
  check (careers_url is null or (careers_url ~* '^https?://[^\s<>"]+$' and length(careers_url) <= 300));
alter table organizations add column if not exists jobs_checked_at timestamptz;

alter table jobs add column if not exists first_seen timestamptz not null default now();
alter table jobs add constraint jobs_url_https check (url ~* '^https://[^\s<>"]+$' and length(url) <= 500);
alter table jobs add constraint jobs_title_len check (length(title) between 1 and 200);

-- Only roles at published organisations are public.
drop policy if exists "public read" on jobs;
create policy "public read" on jobs for select
  using (exists (select 1 from organizations o where o.slug = jobs.org_slug and o.published));

-- Host part of a URL, lower-cased, without "www.".
create or replace function private.url_host(p text) returns text
language sql immutable as $$
  select nullif(lower(regexp_replace(coalesce(p, ''), '^https?://(www\.)?([^/:?#]+).*$', '\2')), lower(coalesce(p, '')))
$$;

-- A job link is accepted only if it points at the provider's own job pages or the
-- company's own site, so a leaked ingest token can't plant links to anywhere else.
create or replace function private.job_url_allowed(p_url text, p_provider text, p_website text) returns boolean
language plpgsql immutable as $$
declare
  h text := private.url_host(p_url);
  site text := private.url_host(p_website);
begin
  if p_url is null or p_url !~* '^https://[^\s<>"\\]+$' or h is null or h !~ '^[a-z0-9.-]+$' then return false; end if;
  if p_provider = 'greenhouse' and h in ('boards.greenhouse.io', 'job-boards.greenhouse.io') then return true; end if;
  if p_provider = 'lever' and h = 'jobs.lever.co' then return true; end if;
  if p_provider = 'ashby' and h = 'jobs.ashbyhq.com' then return true; end if;
  return site is not null and (h = site or h like '%.' || site);
end $$;

create or replace function public.ingest_jobs(p_token text, p_org_slug text, p_jobs jsonb) returns integer
language plpgsql security definer set search_path = public, private as $$
declare
  v_hash text := (select value from private.settings where key = 'ingest_token_sha256');
  v_org organizations;
  v_job jsonb;
  v_urls text[] := '{}';
  v_url text;
  v_title text;
  v_posted date;
  v_count integer := 0;
begin
  if v_hash is null or p_token is null
     or encode(sha256(convert_to(p_token, 'UTF8')), 'hex') <> v_hash then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_org from organizations where slug = p_org_slug and published;
  if v_org.slug is null or v_org.job_board_provider is null then
    raise exception 'organisation has no job board';
  end if;
  if p_jobs is null or jsonb_typeof(p_jobs) <> 'array' then raise exception 'jobs must be an array'; end if;
  if jsonb_array_length(p_jobs) > 500 then raise exception 'too many jobs'; end if;

  for v_job in select * from jsonb_array_elements(p_jobs) loop
    v_url := btrim(v_job->>'url');
    v_title := private.clean_text(v_job->>'title', 200);
    -- Skip anything malformed instead of failing the whole board.
    continue when v_title is null or not private.job_url_allowed(v_url, v_org.job_board_provider, v_org.website)
                  or length(v_url) > 500 or v_url = any(v_urls);
    begin
      v_posted := nullif(v_job->>'posted', '')::date;
    exception when others then
      v_posted := null;
    end;
    insert into jobs (org_slug, title, team, location, url, posted, seen_at)
    values (p_org_slug, v_title, private.clean_text(v_job->>'team', 100), private.clean_text(v_job->>'location', 120),
            v_url, v_posted, now())
    on conflict (url) do update
      set title = excluded.title, team = excluded.team, location = excluded.location,
          posted = excluded.posted, seen_at = now()
      where jobs.org_slug = excluded.org_slug;  -- never take over another company's row
    v_urls := v_urls || v_url;
    v_count := v_count + 1;
  end loop;

  -- Roles no longer on the board are closed.
  delete from jobs where org_slug = p_org_slug and not (url = any(v_urls));
  update organizations set hiring = v_count > 0, jobs_checked_at = now() where slug = p_org_slug;
  return v_count;
end $$;

revoke all on function public.ingest_jobs(text, text, jsonb) from public, anon, authenticated;
-- The cron calls with the public (anon) key; the token is what authorises it.
grant execute on function public.ingest_jobs(text, text, jsonb) to anon;

-- Owners: add the careers link to what they may edit.
create or replace function public.owner_update_org(p_slug text, p_changes jsonb) returns void
language plpgsql security definer set search_path = public, private as $$
declare
  v_email text := public.current_email();
  k text;
begin
  if v_email is null or not exists (select 1 from company_owners where org_slug = p_slug and email = v_email) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('one_liner','website','hiring','job_board_provider','job_board_handle','careers_url','logo_path') then
      raise exception 'field % cannot be edited', k;
    end if;
  end loop;
  if p_changes ? 'job_board_provider' and nullif(p_changes->>'job_board_provider','') is not null
     and p_changes->>'job_board_provider' not in ('greenhouse','lever','ashby') then
    raise exception 'unknown job board';
  end if;
  if p_changes ? 'job_board_handle' and coalesce(p_changes->>'job_board_handle','') !~ '^[A-Za-z0-9_.-]{0,80}$' then
    raise exception 'invalid job board handle';
  end if;
  if p_changes ? 'logo_path' and coalesce(p_changes->>'logo_path','') !~ ('^(' || p_slug || '/logo\.(png|jpg|webp)(\?v=[0-9]+)?)?$') then
    raise exception 'invalid logo path';
  end if;
  update organizations set
    one_liner = case when p_changes ? 'one_liner' then private.clean_text(p_changes->>'one_liner', 280) else one_liner end,
    website = case when p_changes ? 'website' then private.clean_url(p_changes->>'website') else website end,
    hiring = case when p_changes ? 'hiring' then (p_changes->>'hiring')::boolean else hiring end,
    job_board_provider = case when p_changes ? 'job_board_provider' then nullif(p_changes->>'job_board_provider','') else job_board_provider end,
    job_board_handle = case when p_changes ? 'job_board_handle' then nullif(p_changes->>'job_board_handle','') else job_board_handle end,
    careers_url = case when p_changes ? 'careers_url' then private.clean_url(p_changes->>'careers_url') else careers_url end,
    logo_path = case when p_changes ? 'logo_path' then nullif(p_changes->>'logo_path','') else logo_path end,
    updated_at = now()
  where slug = p_slug;
  -- A removed job board takes its synced roles with it.
  if p_changes ? 'job_board_provider' and nullif(p_changes->>'job_board_provider','') is null then
    delete from jobs where org_slug = p_slug;
  end if;
  perform private.audit(v_email, 'owner_update', p_slug, p_changes);
end $$;

-- Admins: set hiring details for any company directly (no request needed).
create or replace function public.admin_set_hiring(p_slug text, p_changes jsonb) returns void
language plpgsql security definer set search_path = public, private as $$
declare
  v_admin text := private.require_admin();
  k text;
begin
  if not exists (select 1 from organizations where slug = p_slug) then raise exception 'unknown organisation'; end if;
  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('hiring','job_board_provider','job_board_handle','careers_url') then
      raise exception 'field % cannot be edited', k;
    end if;
  end loop;
  if nullif(p_changes->>'job_board_provider','') is not null
     and p_changes->>'job_board_provider' not in ('greenhouse','lever','ashby') then
    raise exception 'unknown job board';
  end if;
  if coalesce(p_changes->>'job_board_handle','') !~ '^[A-Za-z0-9_.-]{0,80}$' then
    raise exception 'invalid job board handle';
  end if;
  update organizations set
    hiring = case when p_changes ? 'hiring' then (p_changes->>'hiring')::boolean else hiring end,
    job_board_provider = case when p_changes ? 'job_board_provider' then nullif(p_changes->>'job_board_provider','') else job_board_provider end,
    job_board_handle = case when p_changes ? 'job_board_handle' then nullif(p_changes->>'job_board_handle','') else job_board_handle end,
    careers_url = case when p_changes ? 'careers_url' then private.clean_url(p_changes->>'careers_url') else careers_url end,
    updated_at = now()
  where slug = p_slug;
  if p_changes ? 'job_board_provider' and nullif(p_changes->>'job_board_provider','') is null then
    delete from jobs where org_slug = p_slug;
  end if;
  perform private.audit(v_admin, 'set_hiring', p_slug, p_changes);
end $$;

revoke all on function public.owner_update_org(text, jsonb), public.admin_set_hiring(text, jsonb) from public, anon;
grant execute on function public.owner_update_org(text, jsonb), public.admin_set_hiring(text, jsonb) to authenticated;

-- Public view: careers link, open-role count and when the board was last read.
create or replace view organizations_public with (security_invoker = true) as
select
  o.slug, o.name, o.kind, o.sectors, o.status, o.one_liner, o.website,
  o.founded_year, o.acquired_by, o.municipality, o.area, o.location_precision,
  case when o.location_precision in ('exact','building') then o.address end as address,
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
  to_char(o.updated_at, 'YYYY-MM-DD') as updated_at,
  o.logo_path,
  o.created_at,
  o.careers_url,
  (select count(*) from jobs j where j.org_slug = o.slug)::int as open_roles,
  o.jobs_checked_at
from organizations o
left join areas a on a.slug = o.area
where o.published;
grant select on organizations_public to anon, authenticated;
