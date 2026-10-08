-- Hiring board: only the daily sync (holding the token) can write roles, links stay
-- on trusted hosts, and owners/admins control which boards are read.

insert into private.settings values ('ingest_token_sha256', encode(sha256(convert_to('right-token', 'UTF8')), 'hex'));
insert into private.admins (email) values ('admin@example.com');
insert into company_owners (org_slug, email) values ('spinny', 'owner@spinny.com');
update organizations set job_board_provider = 'lever', job_board_handle = 'spinny', website = 'https://www.spinny.com', hiring = null
  where slug = 'spinny';

-- ---------- Without the token nothing gets in ----------
set local role anon;
select tests.claims('anon');
select tests.throws($$select public.ingest_jobs('wrong-token', 'spinny', '[]')$$, 'not allowed', 'a wrong token is refused');
select tests.throws($$select public.ingest_jobs(null, 'spinny', '[]')$$, 'not allowed', 'a missing token is refused');
select tests.throws($$select public.ingest_jobs('', 'spinny', '[]')$$, 'not allowed', 'an empty token is refused');
select tests.throws($$insert into jobs (org_slug, title, url) values ('spinny', 'Fake', 'https://jobs.lever.co/spinny/1')$$, '%row-level security%', 'anon cannot insert jobs directly');
select tests.throws($$select * from private.settings$$, '%permission denied%', 'anon cannot read the token hash');
select tests.throws($$select public.ingest_jobs('right-token', 'cars24', '[]')$$, '%no job board%', 'companies without a board cannot be written to');
reset role;

set local role authenticated;
select tests.claims('authenticated', 'stranger@example.com');
select tests.throws($$select public.ingest_jobs('right-token', 'spinny', '[]')$$, '%permission denied%', 'signed-in users cannot call the ingest function');
select tests.throws($$select public.admin_set_hiring('spinny', '{"hiring":true}')$$, 'forbidden', 'non-admins cannot set hiring details');
reset role;

-- ---------- With the token: only well-formed roles on trusted hosts ----------
set local role anon;
select tests.claims('anon');
select tests.ok(public.ingest_jobs('right-token', 'spinny', $$[
  {"title":"Backend Engineer","team":"Engineering","location":"Gurugram","url":"https://jobs.lever.co/spinny/1","posted":"2026-10-01"},
  {"title":"Data Analyst","location":"Gurugram","url":"https://careers.spinny.com/jobs/2","posted":"not a date"},
  {"title":"Phish","url":"https://evil.example/jobs/3"},
  {"title":"Lookalike","url":"https://evilspinny.com/jobs/4"},
  {"title":"Userinfo trick","url":"https://jobs.lever.co@evil.example/5"},
  {"title":"Script","url":"javascript:alert(1)"},
  {"title":"Plain http","url":"http://jobs.lever.co/spinny/6"},
  {"title":"","url":"https://jobs.lever.co/spinny/7"},
  {"title":"Backend Engineer (dup)","url":"https://jobs.lever.co/spinny/1"}
]$$) = 2, 'only roles on the provider or company domain are kept');
select tests.ok((select count(*) from jobs where org_slug = 'spinny') = 2, 'two roles are public');
select tests.ok((select posted from jobs where url = 'https://careers.spinny.com/jobs/2') is null, 'a bad date is dropped, not fatal');
select tests.ok((select hiring from organizations_public where slug = 'spinny'), 'roles mark the company as hiring');
select tests.ok((select open_roles from organizations_public where slug = 'spinny') = 2, 'the public view counts open roles');
select tests.throws($$select public.ingest_jobs('right-token', 'spinny', (select jsonb_agg(jsonb_build_object('title','x','url','https://jobs.lever.co/spinny/'||g)) from generate_series(1,501) g))$$, '%too many jobs%', 'a board is capped at 500 roles');
-- Next day the board has one role: the other closes.
select tests.ok(public.ingest_jobs('right-token', 'spinny', '[{"title":"Backend Engineer II","url":"https://jobs.lever.co/spinny/1"}]') = 1, 'a re-sync replaces the list');
select tests.ok((select title from jobs where org_slug = 'spinny') = 'Backend Engineer II', 'roles are updated in place');
select tests.ok(public.ingest_jobs('right-token', 'spinny', '[]') = 0, 'an empty board is accepted');
select tests.ok(not (select hiring from organizations_public where slug = 'spinny'), 'an empty board clears the hiring flag');
reset role;

-- A role URL owned by one company can't be taken over by another's board.
update organizations set job_board_provider = 'lever', job_board_handle = 'cars24', website = 'https://www.cars24.com' where slug = 'cars24';
insert into jobs (org_slug, title, url) values ('cars24', 'Real Cars24 role', 'https://jobs.lever.co/cars24/1');
set local role anon;
select tests.claims('anon');
select public.ingest_jobs('right-token', 'spinny', '[{"title":"Hijack","url":"https://jobs.lever.co/cars24/1"}]');
reset role;
select tests.ok((select org_slug || ':' || title from jobs where url = 'https://jobs.lever.co/cars24/1') = 'cars24:Real Cars24 role', 'one board cannot overwrite another company''s role');

-- Unpublished companies' roles are hidden.
update organizations set published = false where slug = 'cars24';
set local role anon;
select tests.claims('anon');
select tests.ok((select count(*) from jobs where org_slug = 'cars24') = 0, 'roles of unpublished companies are hidden');
select tests.throws($$select public.ingest_jobs('right-token', 'cars24', '[]')$$, '%no job board%', 'unpublished companies are not synced');
reset role;

-- ---------- Owners and admins choose the board ----------
set local role authenticated;
select tests.claims('authenticated', 'owner@spinny.com');
select public.owner_update_org('spinny', '{"careers_url":"https://www.spinny.com/careers"}');
select tests.ok((select careers_url from organizations_public where slug = 'spinny') = 'https://www.spinny.com/careers', 'owner can add a careers link');
select tests.throws($$select public.owner_update_org('spinny', '{"careers_url":"javascript:alert(1)"}')$$, '%invalid url%', 'careers links must be http(s)');
select tests.throws($$select public.owner_update_org('spinny', '{"jobs_checked_at":"2030-01-01"}')$$, '%cannot be edited%', 'owners cannot fake the sync time');
reset role;

set local role anon;
select tests.claims('anon');
select public.ingest_jobs('right-token', 'spinny', '[{"title":"Role","url":"https://jobs.lever.co/spinny/9"}]');
reset role;
set local role authenticated;
select tests.claims('authenticated', 'owner@spinny.com');
select public.owner_update_org('spinny', '{"job_board_provider":"","job_board_handle":""}');
reset role;
select tests.ok((select count(*) from jobs where org_slug = 'spinny') = 0, 'removing a board removes its synced roles');

set local role authenticated;
select tests.claims('authenticated', 'admin@example.com');
select public.admin_set_hiring('magicpin', '{"job_board_provider":"greenhouse","job_board_handle":"magicpin","careers_url":"https://magicpin.in/careers"}');
select tests.ok((select job_board->>'handle' from organizations_public where slug = 'magicpin') = 'magicpin', 'admin can set a job board');
select tests.throws($$select public.admin_set_hiring('magicpin', '{"job_board_provider":"workday"}')$$, '%unknown job board%', 'only supported providers');
select tests.throws($$select public.admin_set_hiring('magicpin', '{"job_board_handle":"../../etc"}')$$, '%invalid job board handle%', 'handles cannot contain path characters');
select tests.throws($$select public.admin_set_hiring('magicpin', '{"verification":"admin_verified"}')$$, '%cannot be edited%', 'admin hiring edits are limited to hiring fields');
reset role;
select tests.ok((select count(*) from private.audit_log where action = 'set_hiring') = 1, 'admin hiring changes are audited');
