-- Gurugram Startup Map: schema
-- Mirrors what the Edmonton map publishes (organizations, relationships,
-- funding rounds, sources) plus the private review queue behind it.

create extension if not exists postgis with schema extensions;

create type org_kind as enum ('company','accelerator','investor','coworking','university_research','government_program','community_group');
create type org_status as enum ('active','acquired','closed','unknown');
create type loc_precision as enum ('exact','building','area','municipality');
create type verification as enum ('unverified','community_verified','company_claimed','admin_verified');

create table areas (
  slug       text primary key,
  name       text not null,
  center     extensions.geography(point, 4326) not null,
  radius_m   integer not null default 1000,
  boundary   extensions.geography(multipolygon, 4326)        -- optional, e.g. HSVP sector polygons from OSM
);

create table organizations (
  slug               text primary key check (slug ~ '^[a-z0-9-]+$'),
  name               text not null,
  kind               org_kind not null,
  sectors            text[] not null default '{}',
  status             org_status not null default 'active',
  one_liner          text,
  website            text,
  founded_year       smallint check (founded_year between 1900 and 2100),
  acquired_by        text references organizations(slug),
  acquired_year      smallint,
  closed_year        smallint,
  municipality       text not null default 'Gurugram',
  area               text references areas(slug),
  location_precision loc_precision not null default 'municipality',
  address            text,                         -- exact/building only; never a home
  location           extensions.geography(point, 4326),       -- the pin (address) or null; area pins come from areas.center
  land_use           text,                         -- OSM landuse/building tag that justified an exact pin
  funding_note       text,                         -- total disclosed funding as reported by a cited list
  hiring             boolean,
  job_board_provider text check (job_board_provider in ('greenhouse','lever','ashby')),
  job_board_handle   text,
  verification       verification not null default 'unverified',
  published          boolean not null default false,
  logo_path          text,                         -- Supabase Storage: logos/{slug}/tile.webp
  updated_at         timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  constraint address_only_when_pinned check (
    (location_precision in ('exact','building')) or address is null
  )
);
create index on organizations using gist (location);
create index on organizations using gin (sectors);
create index on organizations (area);
create index on organizations (acquired_by);

-- Every fact links to the page it came from.
create table sources (
  id         bigint generated always as identity primary key,
  org_slug   text not null references organizations(slug) on delete cascade,
  url        text not null,
  note       text not null,
  fields     text[] not null default '{}',
  retrieved  date not null default current_date
);
create index on sources (org_slug);

-- Program cohorts, fund portfolios, memberships, parent/child.
create table relationships (
  id         bigint generated always as identity primary key,
  from_slug  text not null references organizations(slug) on delete cascade,
  to_slug    text not null references organizations(slug) on delete cascade,
  relation   text not null,           -- 'cohort', 'portfolio', 'member', 'parent', 'partner'
  detail     text,                    -- e.g. 'Cohort 3, 2025'
  source_url text not null,
  unique (from_slug, to_slug, relation)
);
create index on relationships (to_slug);

create table funding_rounds (
  id          bigint generated always as identity primary key,
  org_slug    text not null references organizations(slug) on delete cascade,
  round_type  text not null,
  amount_inr  numeric,
  amount_usd  numeric,
  announced   date,
  investors   text[],
  source_url  text not null           -- only publicly announced rounds, each with its source
);
create index on funding_rounds (org_slug);

create table jobs (
  id         bigint generated always as identity primary key,
  org_slug   text not null references organizations(slug) on delete cascade,
  title      text not null,
  team       text,
  location   text,
  url        text not null unique,
  posted     date,
  seen_at    timestamptz not null default now()
);
create index on jobs (org_slug);

create table events (
  id         bigint generated always as identity primary key,
  title      text not null,
  starts_at  timestamptz not null,
  venue      text,
  area       text references areas(slug),
  url        text not null,
  published  boolean not null default false
);
create index on events (area);

-- Private: submissions, edit suggestions, claims, removal requests.
create table review_queue (
  id          bigint generated always as identity primary key,
  type        text not null check (type in ('submit','edit','claim','removal','event')),
  org_slug    text references organizations(slug) on delete set null,
  payload     jsonb not null,
  contact     text,                   -- never published
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now()
);
create index on review_queue (org_slug);

-- Public read model, shaped like lib/types.ts Org.
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

-- Row-level security: the public can read published data and submit to the queue. Nothing else.
alter table areas          enable row level security;
alter table organizations  enable row level security;
alter table sources        enable row level security;
alter table relationships  enable row level security;
alter table funding_rounds enable row level security;
alter table jobs           enable row level security;
alter table events         enable row level security;
alter table review_queue   enable row level security;

create policy "public read" on areas          for select using (true);
create policy "public read" on organizations  for select using (published);
create policy "public read" on sources        for select using (exists (select 1 from organizations o where o.slug = org_slug and o.published));
create policy "public read" on relationships  for select using (true);
create policy "public read" on funding_rounds for select using (true);
create policy "public read" on jobs           for select using (true);
create policy "public read" on events         for select using (published);
-- review_queue has no public policy yet: submissions go through a server route
-- (or mailto) until the forms ship, so nobody can write to it with the anon key.

grant select on organizations_public to anon, authenticated;
