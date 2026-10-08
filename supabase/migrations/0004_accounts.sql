-- Accounts: admins review requests; approved claimants ("owners") keep their
-- organisation's profile current. Identity comes from Supabase Auth (magic link).
-- Every privileged action is a SECURITY DEFINER function that checks the caller,
-- and writes an audit row. Nothing here is reachable with the public key alone.

create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.admins (
  email text primary key check (email = lower(email))
);

create table if not exists private.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  target text,
  detail jsonb
);

create table if not exists public.company_owners (
  org_slug text not null references organizations(slug) on delete cascade,
  email text not null check (email = lower(email)),
  approved_at timestamptz not null default now(),
  primary key (org_slug, email)
);
alter table company_owners enable row level security;

alter table review_queue add column if not exists reviewed_by text;
alter table review_queue add column if not exists reviewed_at timestamptz;
alter table review_queue add column if not exists review_note text;

-- Who is calling?
create or replace function public.current_email() returns text
language sql stable security definer set search_path = public as $$
  select lower(nullif(auth.email(), ''))
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from private.admins where email = public.current_email())
$$;

create or replace function public.owns_org(p_slug text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_owners where org_slug = p_slug and email = public.current_email())
$$;

revoke all on function public.current_email(), public.is_admin(), public.owns_org(text) from public;
grant execute on function public.current_email(), public.is_admin(), public.owns_org(text) to anon, authenticated;

-- Owners see their own ownership rows; admins see all. Nobody writes directly.
create policy "own rows" on company_owners for select using (email = public.current_email() or public.is_admin());

-- Admins can read the review queue (writes still go through functions).
create policy "admins read" on review_queue for select using (public.is_admin());
-- Admins can see unpublished organisations and their sources, to review them.
create policy "admins read all" on organizations for select using (public.is_admin());
create policy "admins read all" on sources for select using (public.is_admin());

create or replace function private.require_admin() returns text
language plpgsql stable security definer set search_path = public, private as $$
declare v text := public.current_email();
begin
  if v is null or not exists (select 1 from private.admins where email = v) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v;
end $$;

create or replace function private.audit(p_actor text, p_action text, p_target text, p_detail jsonb) returns void
language sql security definer set search_path = private as $$
  insert into private.audit_log (actor, action, target, detail) values (p_actor, p_action, p_target, p_detail)
$$;

create or replace function private.pending_request(p_id bigint, p_type text) returns review_queue
language plpgsql security definer set search_path = public as $$
declare r review_queue;
begin
  select * into r from review_queue where id = p_id for update;
  if r.id is null then raise exception 'request not found'; end if;
  if r.status <> 'pending' then raise exception 'request already reviewed'; end if;
  if p_type is not null and r.type <> p_type then raise exception 'wrong request type'; end if;
  return r;
end $$;

create or replace function private.close_request(p_id bigint, p_status text, p_actor text, p_note text) returns void
language sql security definer set search_path = public as $$
  update review_queue set status = p_status, reviewed_by = p_actor, reviewed_at = now(), review_note = left(p_note, 500) where id = p_id
$$;

-- Validation shared by admin and owner edits.
create or replace function private.clean_url(p text) returns text
language plpgsql immutable as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  if btrim(p) !~* '^https?://[^\s<>"]+$' or length(p) > 300 then raise exception 'invalid url'; end if;
  return btrim(p);
end $$;

create or replace function private.clean_text(p text, p_max int) returns text
language sql immutable as $$
  select nullif(left(btrim(regexp_replace(coalesce(p, ''), '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', 'g')), p_max), '')
$$;

create or replace function private.clean_sectors(p jsonb) returns text[]
language sql immutable as $$
  select coalesce(array(
    select distinct x from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) x
    where x ~ '^[a-z][a-z-]{1,39}$' limit 4), '{}')
$$;

-- ---------- Admin actions ----------

-- Approve a new-organisation submission. p_org lets the admin correct fields first.
create or replace function public.admin_approve_submission(p_request_id bigint, p_org jsonb) returns text
language plpgsql security definer set search_path = public, private as $$
declare
  v_admin text := private.require_admin();
  r review_queue := private.pending_request(p_request_id, 'submit');
  v_slug text := lower(coalesce(p_org->>'slug', ''));
  v_area text := nullif(p_org->>'area', '');
  v_source text := private.clean_url(coalesce(p_org->>'source', r.payload->>'source', r.payload->>'website'));
begin
  if v_slug !~ '^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$' then raise exception 'invalid slug'; end if;
  if exists (select 1 from organizations where slug = v_slug) then raise exception 'slug already exists'; end if;
  if v_area is not null and not exists (select 1 from areas where slug = v_area) then raise exception 'unknown area'; end if;
  insert into organizations (slug, name, kind, sectors, status, one_liner, website, founded_year, municipality, area, location_precision, published, verification)
  values (
    v_slug,
    coalesce(private.clean_text(p_org->>'name', 120), private.clean_text(r.payload->>'company_name', 120)),
    coalesce(nullif(p_org->>'kind', ''), 'company')::org_kind,
    case when p_org ? 'sectors' then private.clean_sectors(p_org->'sectors') else private.clean_sectors(jsonb_build_array(r.payload->>'sector')) end,
    'active',
    coalesce(private.clean_text(p_org->>'one_liner', 280), private.clean_text(r.payload->>'description', 280)),
    private.clean_url(coalesce(p_org->>'website', r.payload->>'website')),
    nullif(p_org->>'founded_year', '')::smallint,
    coalesce(private.clean_text(p_org->>'municipality', 60), private.clean_text(r.payload->>'city', 60), 'Gurugram'),
    v_area,
    (case when v_area is null then 'municipality' else 'area' end)::loc_precision,
    true,
    'community_verified'
  );
  if v_source is not null then
    insert into sources (org_slug, url, note, fields) values (v_slug, v_source, 'Submitted to the map and checked by a reviewer', '{listing}');
  end if;
  perform private.close_request(p_request_id, 'approved', v_admin, p_org->>'note');
  perform private.audit(v_admin, 'approve_submission', v_slug, jsonb_build_object('request', p_request_id));
  return v_slug;
end $$;

-- Apply a correction. Only whitelisted fields; a source is required for factual changes.
create or replace function public.admin_apply_edit(p_request_id bigint, p_slug text, p_changes jsonb, p_source text) returns void
language plpgsql security definer set search_path = public, private as $$
declare
  v_admin text := private.require_admin();
  r review_queue := private.pending_request(p_request_id, null);
  k text;
  v_src text := private.clean_url(p_source);
begin
  if r.type not in ('edit', 'removal') then raise exception 'wrong request type'; end if;
  if not exists (select 1 from organizations where slug = p_slug) then raise exception 'unknown organisation'; end if;
  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('name','one_liner','website','founded_year','sectors','status','funding_note','area','municipality','published') then
      raise exception 'field % cannot be edited', k;
    end if;
  end loop;
  if p_changes ?| array['name','founded_year','status','funding_note','area','municipality'] and v_src is null then
    raise exception 'a source is required for this change';
  end if;
  update organizations set
    name = coalesce(private.clean_text(p_changes->>'name', 120), name),
    one_liner = case when p_changes ? 'one_liner' then private.clean_text(p_changes->>'one_liner', 280) else one_liner end,
    website = case when p_changes ? 'website' then private.clean_url(p_changes->>'website') else website end,
    founded_year = case when p_changes ? 'founded_year' then nullif(p_changes->>'founded_year','')::smallint else founded_year end,
    sectors = case when p_changes ? 'sectors' then private.clean_sectors(p_changes->'sectors') else sectors end,
    status = coalesce(nullif(p_changes->>'status','')::org_status, status),
    funding_note = case when p_changes ? 'funding_note' then private.clean_text(p_changes->>'funding_note', 40) else funding_note end,
    area = case when p_changes ? 'area' then nullif(p_changes->>'area','') else area end,
    location_precision = case when p_changes ? 'area' then (case when nullif(p_changes->>'area','') is null then 'municipality' else 'area' end)::loc_precision else location_precision end,
    municipality = coalesce(private.clean_text(p_changes->>'municipality', 60), municipality),
    published = coalesce((p_changes->>'published')::boolean, published),
    updated_at = now()
  where slug = p_slug;
  if v_src is not null then
    insert into sources (org_slug, url, note, fields)
    values (p_slug, v_src, 'Correction checked by a reviewer', array(select jsonb_object_keys(p_changes)));
  end if;
  perform private.close_request(p_request_id, 'approved', v_admin, null);
  perform private.audit(v_admin, 'apply_edit', p_slug, jsonb_build_object('request', p_request_id, 'changes', p_changes));
end $$;

-- Approve a claim: the claimant can now sign in and edit the profile.
create or replace function public.admin_approve_claim(p_request_id bigint) returns void
language plpgsql security definer set search_path = public, private as $$
declare
  v_admin text := private.require_admin();
  r review_queue := private.pending_request(p_request_id, 'claim');
begin
  insert into company_owners (org_slug, email) values (r.org_slug, lower(r.contact)) on conflict do nothing;
  update organizations set verification = 'company_claimed', updated_at = now()
    where slug = r.org_slug and verification in ('unverified', 'community_verified');
  perform private.close_request(p_request_id, 'approved', v_admin, null);
  perform private.audit(v_admin, 'approve_claim', r.org_slug, jsonb_build_object('request', p_request_id, 'email', r.contact));
end $$;

create or replace function public.admin_reject(p_request_id bigint, p_note text) returns void
language plpgsql security definer set search_path = public, private as $$
declare
  v_admin text := private.require_admin();
  r review_queue := private.pending_request(p_request_id, null);
begin
  perform private.close_request(p_request_id, 'rejected', v_admin, p_note);
  perform private.audit(v_admin, 'reject', r.org_slug, jsonb_build_object('request', p_request_id, 'type', r.type));
end $$;

-- ---------- Owner actions ----------

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
    if k not in ('one_liner','website','hiring','job_board_provider','job_board_handle','logo_path') then
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
    logo_path = case when p_changes ? 'logo_path' then nullif(p_changes->>'logo_path','') else logo_path end,
    updated_at = now()
  where slug = p_slug;
  perform private.audit(v_email, 'owner_update', p_slug, p_changes);
end $$;

revoke all on function
  public.admin_approve_submission(bigint, jsonb), public.admin_apply_edit(bigint, text, jsonb, text),
  public.admin_approve_claim(bigint), public.admin_reject(bigint, text), public.owner_update_org(text, jsonb)
from public, anon;  -- Supabase grants anon EXECUTE on new functions by default; take it back.
grant execute on function
  public.admin_approve_submission(bigint, jsonb), public.admin_apply_edit(bigint, text, jsonb, text),
  public.admin_approve_claim(bigint), public.admin_reject(bigint, text), public.owner_update_org(text, jsonb)
to authenticated;

-- ---------- Logos (Supabase Storage) ----------
-- Public bucket, raster images only (no SVG: it can carry scripts), 512 KB cap.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 524288, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 524288, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

create policy "owners upload logos" on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and (public.is_admin() or public.owns_org((storage.foldername(name))[1])));
create policy "owners replace logos" on storage.objects for update to authenticated
  using (bucket_id = 'logos' and (public.is_admin() or public.owns_org((storage.foldername(name))[1])));
create policy "owners read own logos" on storage.objects for select to authenticated
  using (bucket_id = 'logos' and (public.is_admin() or public.owns_org((storage.foldername(name))[1])));

-- Expose logos and creation time in the public view.
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
  o.created_at
from organizations o
left join areas a on a.slug = o.area
where o.published;
grant select on organizations_public to anon, authenticated;
