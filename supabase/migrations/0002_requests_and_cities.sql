-- Delhi NCR: areas belong to a city, so Noida and Delhi can be added next.
alter table areas add column if not exists city text not null default 'Gurugram';
create index if not exists areas_city_idx on areas (city);

-- Public requests (edit / claim / removal / submit) go through one function.
-- The anon key can call it but can't touch review_queue directly; the function
-- validates input and rate-limits before inserting.
alter table review_queue add column if not exists domain_match boolean;
alter table review_queue add column if not exists source_ip_hash text;

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
create index if not exists review_queue_created_idx on review_queue (created_at);
create index if not exists review_queue_contact_idx on review_queue (contact, created_at);
