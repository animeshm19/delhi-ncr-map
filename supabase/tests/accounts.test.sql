-- Admin review, owner self-service and logo uploads: who may do what.

insert into private.admins (email) values ('admin@example.com');
select public.submit_request('submit', null, '{"company_name":"Test Labs","website":"https://testlabs.example","city":"Noida","description":"Builds tests.","sector":"ai-ml"}', 'founder@testlabs.example', null);
select public.submit_request('claim', 'spinny', '{"name":"Owner","role":"CTO"}', 'owner@spinny.com', null);
select public.submit_request('edit', 'spinny', '{"field":"website"}', 'fan@example.com', null);
select public.submit_request('claim', 'cars24', '{}', 'owner@cars24.com', null);
create temp table ids as select type, org_slug, id from review_queue;
grant select on ids to anon, authenticated;

-- ---------- The public key can't reach any of it ----------
set local role anon;
select tests.claims('anon');
select tests.throws($$select public.admin_reject((select id from ids where type='edit'), 'x')$$, '%permission denied%', 'anon cannot call admin functions');
select tests.throws($$select public.owner_update_org('spinny', '{"one_liner":"hi"}')$$, '%permission denied%', 'anon cannot call owner functions');
select tests.throws($$select * from private.audit_log$$, '%permission denied%', 'anon cannot read the audit log');
select tests.throws($$select * from private.admins$$, '%permission denied%', 'anon cannot list admins');
select tests.ok((select count(*) from company_owners) = 0, 'anon cannot see who owns profiles');
select tests.ok(not public.is_admin(), 'anon is not an admin');
reset role;

-- ---------- A signed-in stranger ----------
set local role authenticated;
select tests.claims('authenticated', 'stranger@example.com');
select tests.throws($$select public.admin_approve_claim((select id from ids where org_slug='spinny' and type='claim'))$$, 'forbidden', 'signed-in non-admin cannot approve claims');
select tests.throws($$select public.admin_approve_submission((select id from ids where type='submit'), '{"slug":"test-labs"}')$$, 'forbidden', 'signed-in non-admin cannot publish organisations');
select tests.throws($$select public.owner_update_org('spinny', '{"one_liner":"pwned"}')$$, 'forbidden', 'non-owner cannot edit a profile');
select tests.ok((select count(*) from review_queue) = 0, 'non-admin still cannot read the queue');
select tests.throws($$insert into private.admins values ('stranger@example.com')$$, '%permission denied%', 'nobody can make themselves admin');
select tests.throws($$insert into company_owners values ('spinny', 'stranger@example.com')$$, '%row-level security%', 'nobody can make themselves an owner');
select tests.throws($$insert into storage.objects (bucket_id, name) values ('logos', 'spinny/logo.png')$$, '%row-level security%', 'non-owner cannot upload a logo');
reset role;

-- ---------- The admin ----------
set local role authenticated;
select tests.claims('authenticated', 'Admin@Example.com');
select tests.ok(public.is_admin(), 'admin is recognised case-insensitively');
select tests.ok((select count(*) from review_queue) = 4, 'admin can read the review queue');
select tests.ok(public.admin_approve_submission((select id from ids where type='submit'), '{"slug":"test-labs","name":"<script>alert(1)</script>Test Labs","sectors":["ai-ml","Bad Sector!","x"]}') = 'test-labs', 'admin can publish a submission');
select tests.ok((select municipality from organizations where slug='test-labs') = 'Noida', 'submission city is carried over');
select tests.ok((select sectors from organizations where slug='test-labs') = array['ai-ml'], 'junk sector slugs are dropped');
select tests.ok((select count(*) from sources where org_slug='test-labs') = 1, 'the submitted page becomes a source');
select tests.throws($$select public.admin_approve_submission((select id from ids where type='submit'), '{"slug":"test-labs-2"}')$$, '%already reviewed%', 'a request can only be reviewed once');
select tests.throws($$select public.admin_apply_edit((select id from ids where type='edit'), 'spinny', '{"verification":"admin_verified"}', null)$$, '%cannot be edited%', 'admin edits are limited to whitelisted fields');
select tests.throws($$select public.admin_apply_edit((select id from ids where type='edit'), 'spinny', '{"founded_year":"1999"}', null)$$, '%source is required%', 'factual corrections need a source');
select tests.throws($$select public.admin_apply_edit((select id from ids where type='edit'), 'spinny', '{"website":"javascript:alert(1)"}', null)$$, '%invalid url%', 'javascript: links are refused');
select public.admin_apply_edit((select id from ids where type='edit'), 'spinny', '{"website":"https://www.spinny.com/"}', null);
select tests.ok((select website from organizations where slug='spinny') = 'https://www.spinny.com/', 'admin can apply a correction');
select public.admin_approve_claim((select id from ids where org_slug='spinny' and type='claim'));
select tests.ok((select verification from organizations where slug='spinny') = 'company_claimed', 'approved claim marks the profile claimed');
select public.admin_reject((select id from ids where org_slug='cars24'), 'not verifiable');
select tests.ok((select status from review_queue where org_slug='cars24' and type='claim') = 'rejected', 'admin can reject a request');
reset role;
select tests.ok((select count(*) from private.audit_log) = 4, 'every admin action is audited');
select tests.ok(not exists (select 1 from company_owners where org_slug = 'cars24'), 'rejected claim grants nothing');

-- ---------- The owner ----------
set local role authenticated;
select tests.claims('authenticated', 'owner@spinny.com');
select tests.ok((select count(*) from company_owners) = 1, 'owner sees only their own ownership');
select public.owner_update_org('spinny', '{"one_liner":"Buy and sell used cars.","hiring":true,"job_board_provider":"lever","job_board_handle":"spinny","logo_path":"spinny/logo.png"}');
select tests.ok((select one_liner from organizations where slug='spinny') = 'Buy and sell used cars.', 'owner can update the description');
select tests.ok((select hiring from organizations where slug='spinny'), 'owner can mark the company hiring');
select tests.throws($$select public.owner_update_org('spinny', '{"name":"Other"}')$$, '%cannot be edited%', 'owner cannot rename the company');
select tests.throws($$select public.owner_update_org('spinny', '{"verification":"admin_verified"}')$$, '%cannot be edited%', 'owner cannot mark themselves verified');
select tests.throws($$select public.owner_update_org('spinny', '{"logo_path":"cars24/logo.png"}')$$, '%invalid logo path%', 'owner cannot point the logo at another company''s file');
select tests.throws($$select public.owner_update_org('spinny', '{"logo_path":"https://evil.example/x.svg"}')$$, '%invalid logo path%', 'owner cannot use an outside logo URL');
select tests.throws($$select public.owner_update_org('spinny', '{"job_board_provider":"evil"}')$$, '%unknown job board%', 'only known job boards are allowed');
select tests.throws($$select public.owner_update_org('spinny', '{"job_board_handle":"../../etc"}')$$, '%invalid job board handle%', 'job board handles are validated');
select tests.throws($$select public.owner_update_org('cars24', '{"one_liner":"x"}')$$, 'forbidden', 'owner cannot edit another company');
insert into storage.objects (bucket_id, name) values ('logos', 'spinny/logo.png');
select tests.ok(true, 'owner can upload their own logo');
select tests.throws($$insert into storage.objects (bucket_id, name) values ('logos', 'cars24/logo.png')$$, '%row-level security%', 'owner cannot upload another company''s logo');
select tests.throws($$select public.admin_reject(1, 'x')$$, 'forbidden', 'owner is not an admin');
reset role;
