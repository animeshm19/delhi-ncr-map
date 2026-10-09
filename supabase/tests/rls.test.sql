-- Row-level security and the public request function, as an anonymous visitor
-- and as a random signed-in user. Runs inside a transaction that is rolled back.

-- Setup (as the database owner): an unpublished org and some private rows.
insert into organizations (slug, name, kind, published) values ('secret-draft', 'Secret Draft', 'company', false);
insert into sources (org_slug, url, note) values ('secret-draft', 'https://example.com', 'private source');
insert into review_queue (type, payload, contact) values ('submit', '{"x":"y"}', 'someone@example.com');
create temp table expected as select count(*) as published from organizations where published;
grant select on expected to anon, authenticated;

-- ---------- Anonymous visitor ----------
set local role anon;
select tests.claims('anon');

select tests.ok((select count(*) from organizations) = (select published from expected), 'anon reads every published organisation');
select tests.ok((select count(*) from organizations where slug = 'secret-draft') = 0, 'anon cannot see unpublished organisations');
select tests.ok((select count(*) from organizations_public where slug = 'secret-draft') = 0, 'public view hides unpublished organisations');
select tests.ok((select count(*) from sources where org_slug = 'secret-draft') = 0, 'anon cannot see sources of unpublished organisations');
select tests.ok((select count(*) from review_queue) = 0, 'anon cannot read the review queue');

select tests.throws($$insert into organizations (slug, name, kind, published) values ('hacked', 'Hacked', 'company', true)$$,
  '%row-level security%', 'anon cannot create organisations');
select tests.affects_none($$update organizations set name = 'Hacked' where slug = 'spinny'$$, 'anon cannot rename organisations');
select tests.affects_none($$delete from organizations where slug = 'spinny'$$, 'anon cannot delete organisations');
select tests.throws($$insert into sources (org_slug, url, note) values ('spinny', 'https://evil.example', 'fake')$$,
  '%row-level security%', 'anon cannot add sources');
select tests.affects_none($$delete from sources$$, 'anon cannot delete sources');
select tests.throws($$insert into review_queue (type, payload, contact) values ('submit', '{}', 'a@b.co')$$,
  '%row-level security%', 'anon cannot write to the review queue directly');
select tests.affects_none($$update review_queue set status = 'approved'$$, 'anon cannot approve requests');
select tests.affects_none($$delete from review_queue$$, 'anon cannot delete requests');
select tests.throws($$insert into jobs (org_slug, title, url) values ('spinny', 'Fake job', 'https://evil.example/job')$$,
  '%row-level security%', 'anon cannot add job listings');
select tests.throws($$insert into events (title, starts_at, url, published) values ('Fake', now(), 'https://evil.example', true)$$,
  '%row-level security%', 'anon cannot publish events');
select tests.throws($$insert into areas (slug, name, center) values ('x', 'x', 'SRID=4326;POINT(0 0)')$$,
  '%row-level security%', 'anon cannot add areas');

-- submit_request(): the only way in, and it validates everything.
select tests.ok(public.submit_request('edit', 'spinny', '{"field":"website"}', 'Person@Example.com', 'iphash-1') > 0,
  'valid edit request is accepted');
select tests.throws($$select public.submit_request('edit', 'spinny', '{}', 'not-an-email', null)$$,
  '%valid email%', 'request with an invalid email is rejected');
select tests.throws($$select public.submit_request('edit', 'no-such-org', '{}', 'a@b.co', null)$$,
  '%unknown organisation%', 'request for an unknown organisation is rejected');
select tests.throws($$select public.submit_request('edit', 'secret-draft', '{}', 'a@b.co', null)$$,
  '%unknown organisation%', 'request for an unpublished organisation is rejected');
select tests.throws($$select public.submit_request('approve', 'spinny', '{}', 'a@b.co', null)$$,
  '%invalid request type%', 'unknown request type is rejected');
select tests.throws($$select public.submit_request('edit', 'spinny', '[1,2]', 'a@b.co', null)$$,
  '%too long%', 'non-object payload is rejected');
select tests.throws(format($$select public.submit_request('edit', 'spinny', %L, 'a@b.co', null)$$,
  jsonb_build_object('x', repeat('a', 7000))), '%too long%', 'oversized payload is rejected');

-- Claims are flagged only when the email is really on the organisation's domain.
reset role;
select public.submit_request('claim', 'policybazaar', '{}', 'me@policybazaar.com', null);
select tests.ok((select domain_match from review_queue order by id desc limit 1), 'claim from the org''s own domain is flagged');
select public.submit_request('claim', 'policybazaar', '{}', 'me@careers.policybazaar.com', null);
select tests.ok((select domain_match from review_queue order by id desc limit 1), 'claim from an org subdomain is flagged');
select public.submit_request('claim', 'policybazaar', '{}', 'me@policybazaar.com.evil.io', null);
select tests.ok(not (select domain_match from review_queue order by id desc limit 1), 'look-alike domain is not flagged');
select public.submit_request('claim', 'policybazaar', '{}', 'me@evilpolicybazaar.com', null);
select tests.ok(not (select domain_match from review_queue order by id desc limit 1), 'domain with a prefix is not flagged');
select public.submit_request('claim', 'policybazaar', '{}', 'me@gmail.com', null);
select tests.ok(not (select domain_match from review_queue order by id desc limit 1), 'free email address is not flagged');

-- Rate limits: 5 per email per hour.
set local role anon;
select public.submit_request('edit', 'spinny', '{}', 'flood@example.com', null) from generate_series(1, 5);
select tests.throws($$select public.submit_request('edit', 'spinny', '{}', 'FLOOD@example.com', null)$$,
  '%too many requests%', 'sixth request from the same email within an hour is rejected (case-insensitive)');
-- ...and 10 per client per hour, whatever the email.
select public.submit_request('edit', 'spinny', '{}', format('c%s@example.com', g), 'same-client') from generate_series(1, 10) g;
select tests.throws($$select public.submit_request('edit', 'spinny', '{}', 'fresh@example.com', 'same-client')$$,
  '%too many requests%', 'eleventh request from the same client within an hour is rejected');

-- ---------- Signed-in user with no special rights ----------
reset role;
set local role authenticated;
select tests.claims('authenticated', 'random@example.com');
select tests.ok((select count(*) from review_queue) = 0, 'signed-in user cannot read the review queue');
select tests.affects_none($$update organizations set name = 'Hacked' where slug = 'spinny'$$, 'signed-in user cannot edit organisations');
select tests.throws($$insert into organizations (slug, name, kind, published) values ('hacked2', 'Hacked', 'company', true)$$,
  '%row-level security%', 'signed-in user cannot create organisations');
reset role;
