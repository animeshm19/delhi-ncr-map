-- Events: the public can suggest, only reviewers publish, and only published events show.

insert into private.admins (email) values ('admin@example.com');
-- Dates are relative to today so the tests never go stale: DAY is 30 days from now (IST).
select set_config('tests.day', to_char((now() + interval '30 days') at time zone 'Asia/Kolkata', 'YYYY-MM-DD'), false);
create function tests.ev(j text) returns jsonb language sql stable as $f$ select replace(j, 'DAY', current_setting('tests.day'))::jsonb $f$;
grant execute on function tests.ev(text) to anon, authenticated;
select public.submit_request('event', null, tests.ev('{"title":"Gurugram AI Meetup","starts_at":"DAYT18:30"}'), 'organiser@example.com', null);
select public.submit_request('event', null, '{"title":"Second"}', 'other@example.com', null);
select public.submit_request('edit', 'spinny', '{"field":"website"}', 'fan@example.com', null);
create temp table ids as select id, type, payload->>'title' as title from review_queue;
grant select on ids to anon, authenticated;
insert into events (title, starts_at, url, published) values ('Hidden draft', now() + interval '3 days', 'https://example.com/draft', false);

-- ---------- The public ----------
set local role anon;
select tests.claims('anon');
select tests.ok((select count(*) from review_queue) = 0, 'event suggestions are private');
select tests.ok((select count(*) from events) = 0, 'unpublished events are hidden');
select tests.throws($$insert into events (title, starts_at, url, published) values ('Spam', now(), 'https://spam.example', true)$$, '%row-level security%', 'anon cannot publish events directly');
select tests.throws($$select public.admin_publish_event((select id from ids where title = 'Gurugram AI Meetup'), '{"title":"x"}')$$, '%permission denied%', 'anon cannot call admin event functions');
select tests.ok(public.submit_request('event', 'spinny', '{"title":"Org slug is ignored"}', 'x@example.com', null) > 0, 'event suggestions are accepted');
reset role;
select tests.ok((select org_slug from review_queue where payload->>'title' = 'Org slug is ignored') is null, 'event suggestions never attach to an organisation');

set local role authenticated;
select tests.claims('authenticated', 'stranger@example.com');
select tests.throws($$select public.admin_publish_event((select id from ids where title = 'Gurugram AI Meetup'), tests.ev('{"title":"x","url":"https://x.example","starts_at":"DAYT18:30:00+05:30"}'))$$, 'forbidden', 'non-admins cannot publish events');
select tests.throws($$select public.admin_unpublish_event(1)$$, 'forbidden', 'non-admins cannot unpublish events');
reset role;

-- ---------- The reviewer ----------
set local role authenticated;
select tests.claims('authenticated', 'admin@example.com');
select tests.throws($$select public.admin_publish_event((select id from ids where type = 'edit'), tests.ev('{"title":"x","url":"https://x.example","starts_at":"DAYT18:30:00+05:30"}'))$$, '%wrong request type%', 'only event requests can become events');
select tests.throws($$select public.admin_publish_event((select id from ids where title = 'Gurugram AI Meetup'), tests.ev('{"title":"x","url":"javascript:alert(1)","starts_at":"DAYT18:30:00+05:30"}'))$$, '%invalid url%', 'event links must be http(s)');
select tests.throws($$select public.admin_publish_event((select id from ids where title = 'Gurugram AI Meetup'), tests.ev('{"title":"x","starts_at":"DAYT18:30:00+05:30"}'))$$, '%link to the event page is required%', 'events need a link');
select tests.throws($$select public.admin_publish_event((select id from ids where title = 'Gurugram AI Meetup'), '{"title":"x","url":"https://x.example","starts_at":"next tuesday"}')$$, '%invalid date%', 'dates must parse');
select tests.throws($$select public.admin_publish_event((select id from ids where title = 'Gurugram AI Meetup'), '{"title":"x","url":"https://x.example","starts_at":"2001-01-01T10:00:00Z"}')$$, '%out of range%', 'past events are refused');
select tests.throws($$select public.admin_publish_event((select id from ids where title = 'Gurugram AI Meetup'), tests.ev('{"title":"x","url":"https://x.example","starts_at":"DAYT18:30:00+05:30","ends_at":"DAYT17:00:00+05:30"}'))$$, '%invalid end time%', 'an event cannot end before it starts');
select tests.throws($$select public.admin_publish_event((select id from ids where title = 'Gurugram AI Meetup'), tests.ev('{"title":"x","url":"https://x.example","starts_at":"DAYT18:30:00+05:30","area":"atlantis"}'))$$, '%unknown area%', 'areas must exist');
select tests.ok(public.admin_publish_event((select id from ids where title = 'Gurugram AI Meetup'),
  tests.ev('{"title":"Gurugram AI Meetup","url":"https://meetup.example/ai","starts_at":"DAYT18:30:00+05:30","ends_at":"DAYT21:00:00+05:30","venue":"Cyber Hub","area":"dlf-cyber-city","organizer":"AI Club","description":"Talks and demos."}')) > 0,
  'admin publishes an event');
select tests.throws($$select public.admin_publish_event((select id from ids where title = 'Gurugram AI Meetup'), tests.ev('{"title":"again","url":"https://x.example","starts_at":"DAYT18:30:00+05:30"}'))$$, '%already reviewed%', 'a request is published once');
reset role;

set local role anon;
select tests.claims('anon');
select tests.ok((select starts_at from events where title = 'Gurugram AI Meetup') = (current_setting('tests.day') || ' 13:00:00+00')::timestamptz, 'IST times are stored correctly');
select tests.ok((select count(*) from events) = 1, 'the public sees exactly the published event');
reset role;

set local role authenticated;
select tests.claims('authenticated', 'admin@example.com');
select public.admin_unpublish_event((select id from events where title = 'Gurugram AI Meetup'));
reset role;
set local role anon;
select tests.claims('anon');
select tests.ok((select count(*) from events) = 0, 'unpublished events disappear');
reset role;
select tests.ok((select count(*) from private.audit_log where action in ('publish_event', 'unpublish_event')) = 2, 'event actions are audited');
