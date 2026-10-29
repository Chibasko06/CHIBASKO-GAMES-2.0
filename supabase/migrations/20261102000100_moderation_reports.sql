begin;
set local lock_timeout='5s';

create table public.moderation_cases (
 id uuid primary key default gen_random_uuid(),number bigint generated always as identity unique,
 reporter uuid references public.profiles(id) on delete set null,
 target_kind text not null check(target_kind in ('player','game')),
 target_user uuid references public.profiles(id) on delete set null,
 target_game uuid references public.games(id) on delete set null,
 target_locator text not null,
 category text not null check(category in ('harassment','spam','impersonation','inappropriate','security','illegal','other')),
 description text not null check(length(description) between 20 and 5000),
 contact_name text check(length(contact_name)<=160),contact_email text check(length(contact_email)<=254),
 legal_notice boolean not null default false,good_faith boolean not null default false,
 sensitive_exception boolean not null default false,
 state text not null default 'open' check(state in ('open','review','dismissed','resolved')),
 version integer not null default 1,justification text,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 closed_at timestamptz,expires_at timestamptz,privacy_review boolean not null default false,
 search_document tsvector generated always as (to_tsvector('simple',category||' '||description)) stored,
 check(not legal_notice or good_faith),check(not sensitive_exception or legal_notice),
 check((state in ('open','review') and closed_at is null and expires_at is null)
  or (state in ('dismissed','resolved') and closed_at is not null and expires_at is not null and expires_at>closed_at and justification is not null and length(justification) between 10 and 5000)),
 check((target_kind='player' and target_game is null) or (target_kind='game' and target_user is null))
);
create index moderation_cases_page on public.moderation_cases(created_at desc,id desc);
create index moderation_cases_state on public.moderation_cases(state,created_at desc,id desc);
create index moderation_cases_kind on public.moderation_cases(target_kind,created_at desc,id desc);
create index moderation_cases_state_kind on public.moderation_cases(state,target_kind,created_at desc,id desc);
create index moderation_cases_search on public.moderation_cases using gin(search_document);
create index moderation_cases_reporter on public.moderation_cases(reporter);
create index moderation_cases_target_user on public.moderation_cases(target_user);
create index moderation_cases_target_game on public.moderation_cases(target_game);
create index moderation_cases_expiry on public.moderation_cases(expires_at,id) where expires_at is not null;
create table public.moderation_events (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.moderation_cases(id) on delete cascade,
 actor uuid references public.profiles(id) on delete set null,actor_reference uuid,version integer not null,
 state text not null check(state in ('open','review','dismissed','resolved')),justification text,note text check(length(note)<=5000),redacted boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),unique(case_id,version)
);
create index moderation_events_actor on public.moderation_events(actor);
create table public.moderation_receipts (
 operation uuid primary key,client_hash text not null check(client_hash ~ '^[a-f0-9]{64}$'),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),case_id uuid not null references public.moderation_cases(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp()
);
create index moderation_receipts_client on public.moderation_receipts(client_hash,created_at desc);
create index moderation_receipts_duplicate on public.moderation_receipts(client_hash,fingerprint,created_at desc);
create index moderation_receipts_case on public.moderation_receipts(case_id);
create table public.moderation_mail (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.moderation_cases(id) on delete cascade,
 kind text not null check(kind in ('admin','receipt','decision')),version integer not null,
 state text not null default 'pending' check(state in ('pending','sent','attention_required')),
 message jsonb,attempts integer not null default 0,first_attempt_at timestamptz,next_attempt_at timestamptz not null default now(),
 lease uuid,lease_until timestamptz,created_at timestamptz not null default clock_timestamp(),unique(case_id,kind,version)
);
create index moderation_mail_claim on public.moderation_mail(next_attempt_at,created_at,id) where state='pending';
do $$ declare name text;begin
 foreach name in array array['moderation_cases','moderation_events','moderation_receipts','moderation_mail'] loop
  execute format('alter table public.%I enable row level security',name);
  execute format('revoke all on public.%I from public,anon,authenticated',name);
  execute format('grant select,insert,update,delete on public.%I to service_role',name);
 end loop;
end $$;
grant usage,select on sequence public.moderation_cases_number_seq to service_role;
revoke all on sequence public.moderation_cases_number_seq from public,anon,authenticated;

-- Seul le serveur vérifié transmet l'identité ; les invités utilisent le même dossier.
create function public.distribution_moderation_submit(p_actor uuid,p_input jsonb,p_client text,p_fingerprint text) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' set statement_timeout='10s' as $$
declare op uuid;target uuid;kind text;category text;description text;legal_notice boolean;sensitive boolean;previous public.moderation_receipts;record public.moderation_cases;locator text;
begin
 if p_client is null or p_client!~'^[a-f0-9]{64}$' or p_fingerprint is null or p_fingerprint!~'^[a-f0-9]{64}$' then raise exception 'invalid_request';end if;
 op:=(p_input->>'operationId')::uuid;kind:=p_input->>'kind';
 if coalesce(p_input->>'target','')~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then target:=(p_input->>'target')::uuid;
 elsif kind='player' then select id into target from public.profiles where lower(username)=lower(ltrim(p_input->>'target','@'));
 else select id into target from public.games where slug=p_input->>'target';end if;
 category:=p_input->>'category';description:=btrim(p_input->>'description');
 legal_notice:=category='illegal';sensitive:=coalesce((p_input->>'sensitiveException')::boolean,false);
 if op is null or kind is null or kind not in ('player','game') or category is null
  or category not in ('harassment','spam','impersonation','inappropriate','security','illegal','other')
  or (kind='game' and category='harassment') or (kind='player' and category='security')
  or description is null or length(description) not between 20 and 5000
  or (legal_notice and coalesce((p_input->>'goodFaith')::boolean,false) is not true)
  or (sensitive and not legal_notice) or length(coalesce(p_input->>'contactName',''))>160 or length(coalesce(p_input->>'contactEmail',''))>254
  or ((p_actor is null or legal_notice) and not sensitive and (length(btrim(coalesce(p_input->>'contactName','')))<2 or coalesce(p_input->>'contactEmail','')!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')) then raise exception 'invalid_request';end if;
 if p_actor is not null then
  perform 1 from auth.users where id=p_actor for key share;
  if not exists(select 1 from public.profiles where id=p_actor) or public.distribution_account_pending(p_actor) then raise exception 'unauthorized';end if;
 end if;
 if kind='player' and p_actor=target then raise exception 'invalid_request';end if;
 perform pg_advisory_xact_lock(hashtextextended('moderation-client:'||p_client,0));
 select * into previous from public.moderation_receipts where operation=op;
 if found then
  if previous.client_hash<>p_client or previous.fingerprint<>p_fingerprint then raise exception 'idempotency_conflict';end if;
  select * into record from public.moderation_cases where id=previous.case_id;
  return jsonb_build_object('id',record.id,'number',record.number,'replayed',true);
 end if;
 select * into previous from public.moderation_receipts where client_hash=p_client and fingerprint=p_fingerprint and created_at>now()-interval '24 hours' order by created_at desc limit 1;
 if found then
  select * into record from public.moderation_cases where id=previous.case_id;
  return jsonb_build_object('id',record.id,'number',record.number,'replayed',true);
 end if;
 if target is null then raise exception 'invalid_request';end if;
 if kind='player' then
  perform 1 from public.profiles where id=target for key share;
  if not found then raise exception 'invalid_request';end if;
  locator:='/players/'||target::text;
 else
  select '/games/'||slug into locator from public.games where id=target and is_published for share;
  if not found then raise exception 'game_not_found';end if;
 end if;
 -- Pas de plafond journalier pour les notifications de contenu potentiellement illicite.
 if (select count(*) from public.moderation_receipts where client_hash=p_client and created_at>now()-interval '1 minute')>=30
  or (not legal_notice and (select count(*) from public.moderation_receipts where client_hash=p_client and created_at>now()-interval '24 hours')>=20) then raise exception 'rate_limited';end if;
 insert into public.moderation_cases(reporter,target_kind,target_user,target_game,target_locator,category,description,contact_name,contact_email,legal_notice,good_faith,sensitive_exception)
 values(p_actor,kind,case when kind='player' then target end,case when kind='game' then target end,locator,category,description,
  nullif(btrim(p_input->>'contactName'),''),nullif(lower(btrim(p_input->>'contactEmail')),''),legal_notice,coalesce((p_input->>'goodFaith')::boolean,false),sensitive) returning * into record;
 insert into public.moderation_receipts(operation,client_hash,fingerprint,case_id) values(op,p_client,p_fingerprint,record.id);
 insert into public.moderation_events(case_id,actor,version,state) values(record.id,p_actor,1,'open');
 insert into public.moderation_mail(case_id,kind,version) values(record.id,'admin',1);
 if legal_notice and record.contact_email is not null then insert into public.moderation_mail(case_id,kind,version) values(record.id,'receipt',1);end if;
 return jsonb_build_object('id',record.id,'number',record.number,'replayed',false);
end $$;

create function public.distribution_moderation_admin(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' set statement_timeout='10s' as $$
declare record public.moderation_cases;requested uuid;new_state text;days integer;page integer;result jsonb;q text;status text;kind text;search_id uuid;search_number bigint;
begin
 perform 1 from auth.users where id=p_actor for key share;
 if not found then raise exception 'forbidden';end if;
 if not exists(select 1 from public.admin_users where user_id=p_actor) or not public.social_account_active(p_actor) then raise exception 'forbidden';end if;
 requested:=nullif(p_input->>'id','')::uuid;
 if p_input->>'action'='update' then
  new_state:=p_input->>'state';days:=(p_input->>'retentionDays')::integer;
  if new_state is null or new_state not in ('review','dismissed','resolved') or days is null or days not between 1 and 3650
   or length(coalesce(p_input->>'note',''))>5000 or length(coalesce(p_input->>'justification',''))>5000
   or (new_state in ('dismissed','resolved') and length(btrim(coalesce(p_input->>'justification','')))<10) then raise exception 'invalid_request';end if;
  select * into record from public.moderation_cases where id=requested for update;
  if not found then raise exception 'invalid_request';end if;
  if p_input->>'version' is null or record.version<>(p_input->>'version')::integer then raise exception 'idempotency_conflict';end if;
  if record.privacy_review and new_state in ('dismissed','resolved') and coalesce((p_input->>'privacyReviewed')::boolean,false) is not true then raise exception 'invalid_request';end if;
  if p_input ? 'redactedDescription' and length(btrim(coalesce(p_input->>'redactedDescription',''))) not between 20 and 5000 then raise exception 'invalid_request';end if;
  if (p_input ? 'redactedDescription' or coalesce((p_input->>'redactNotes')::boolean,false)) and length(btrim(coalesce(p_input->>'note','')))<10 then raise exception 'invalid_request';end if;
  if coalesce((p_input->>'redactNotes')::boolean,false) then update public.moderation_events set note=null,justification=null where case_id=requested;end if;
  if p_input ? 'redactedDescription' or coalesce((p_input->>'redactNotes')::boolean,false) then
   update public.moderation_mail set message=null,state=case when state='sent' then 'sent' else 'attention_required' end,lease=null,lease_until=null where case_id=requested;
  end if;
  update public.moderation_cases set description=coalesce(p_input->>'redactedDescription',description),privacy_review=case when coalesce((p_input->>'privacyReviewed')::boolean,false) then false else privacy_review end,state=new_state,version=version+1,justification=nullif(btrim(p_input->>'justification'),''),updated_at=clock_timestamp(),
   closed_at=case when new_state in ('dismissed','resolved') then now() end,
   expires_at=case when new_state in ('dismissed','resolved') then now()+make_interval(days=>days) end where id=requested returning * into record;
  insert into public.moderation_events(case_id,actor,actor_reference,version,state,justification,note,redacted) values(record.id,p_actor,p_actor,record.version,new_state,record.justification,nullif(btrim(p_input->>'note'),''),p_input ? 'redactedDescription' or coalesce((p_input->>'redactNotes')::boolean,false));
  if record.legal_notice and record.contact_email is not null and new_state in ('dismissed','resolved') then
   insert into public.moderation_mail(case_id,kind,version) values(record.id,'decision',record.version);
  end if;
 end if;
 if requested is not null then
  select to_jsonb(c)-'search_document'||jsonb_build_object('reporter_name',(select username from public.profiles where id=c.reporter),
   'target_view',case when c.target_kind='player' then (select jsonb_build_object('username',p.username,'bio',p.bio) from public.profiles p where p.id=c.target_user)
    else (select jsonb_build_object('title',g.title,'published',g.is_published) from public.games g where g.id=c.target_game) end,
   'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.version) from public.moderation_events e where e.case_id=c.id),'[]'::jsonb),
   'mail',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'state',m.state,'attempts',m.attempts)) from public.moderation_mail m where m.case_id=c.id),'[]'::jsonb)) into result from public.moderation_cases c where c.id=requested;
  return result;
 end if;
 page:=coalesce((p_input->>'page')::integer,1);q:=btrim(coalesce(p_input->>'search',''));status:=coalesce(p_input->>'state','');kind:=coalesce(p_input->>'kind','');
 if page not between 1 and 10000 or length(q)>100 or status not in ('','open','review','dismissed','resolved') or kind not in ('','player','game') then raise exception 'invalid_request';end if;
 if q~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then search_id:=q::uuid;elsif q~'^[0-9]{1,18}$' then search_number:=q::bigint;end if;
 with batch as (
  select id,number,target_kind,category,state,created_at,reporter,(select username from public.profiles where id=c.reporter) as reporter_name,privacy_review from public.moderation_cases c
  where (status='' or c.state=status) and (kind='' or c.target_kind=kind)
   and (q='' or c.id=search_id or c.number=search_number or (search_id is null and search_number is null and c.search_document@@plainto_tsquery('simple',q)))
   order by created_at desc,id desc offset (page-1)*20 limit 21
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from (select * from batch order by created_at desc,id desc limit 20) x),'[]'::jsonb),'hasMore',(select count(*) from batch)>20,'page',page) into result;
 return result;
end $$;

create function public.distribution_moderation_claim_mail() returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare job public.moderation_mail;result jsonb;
begin
 update public.moderation_mail set state='attention_required',lease=null,lease_until=null where id in
  (select id from public.moderation_mail where state='pending' and (lease_until is null or lease_until<=now())
   and (attempts>=8 or first_attempt_at<=now()-interval '22 hours') order by created_at,id limit 100 for update skip locked);
 select * into job from public.moderation_mail where state='pending' and next_attempt_at<=now() and (lease_until is null or lease_until<=now())
  order by case kind when 'receipt' then 0 else 1 end,next_attempt_at,created_at,id limit 1 for update skip locked;
 if not found then return null;end if;
 update public.moderation_mail set lease=gen_random_uuid(),lease_until=now()+interval '90 seconds',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()) where id=job.id returning * into job;
 select jsonb_build_object('id',job.id,'lease',job.lease,'kind',job.kind,'message',job.message,'case',jsonb_build_object('id',c.id,'number',c.number,'category',c.category,'target_kind',c.target_kind,'contact_email',c.contact_email),
  'decision',(select justification from public.moderation_events where case_id=c.id and version=job.version)) into result from public.moderation_cases c where c.id=job.case_id;
 return result;
end $$;

create function public.distribution_moderation_prepare_mail(p_id uuid,p_lease uuid,p_message jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 update public.moderation_mail set message=coalesce(message,p_message) where id=p_id and lease=p_lease and lease_until>now() and state='pending' returning message into result;
 if not found then raise exception 'lease_lost';end if;return result;
end $$;
create function public.distribution_moderation_finish_mail(p_id uuid,p_lease uuid,p_success boolean,p_permanent boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.moderation_mail set state=case when p_success then 'sent' when p_permanent or attempts>=8 then 'attention_required' else 'pending' end,
  lease=null,lease_until=null,next_attempt_at=now()+make_interval(secs=>least(3600,300*(2^greatest(attempts-1,0))::integer))
  where id=p_id and lease=p_lease and lease_until>now() and state='pending';
 if not found then raise exception 'lease_lost';end if;
end $$;

-- Les références structurées sont anonymisées ; le texte reste soumis à revue privée.
create function public.moderation_profile_removed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.moderation_cases set contact_name=null,contact_email=null,privacy_review=true where reporter=old.id;
 update public.moderation_cases set target_locator='/players/compte-supprime',privacy_review=true where target_user=old.id;
 update public.moderation_mail set message=null,state=case when state='sent' then 'sent' else 'attention_required' end,lease=null,lease_until=null
  where case_id in(select id from public.moderation_cases where reporter=old.id or target_user=old.id);
 return old;
end $$;
create trigger moderation_profile_removed before delete on public.profiles for each row execute function public.moderation_profile_removed();

create function public.distribution_moderation_cleanup() returns integer
language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare total integer;begin
 if not pg_try_advisory_xact_lock(hashtextextended('moderation-cleanup',0)) then return 0;end if;
 delete from public.moderation_cases where id in(select c.id from public.moderation_cases c where state in ('dismissed','resolved') and expires_at<=now()
  and not exists(select 1 from public.moderation_mail m where m.case_id=c.id and m.lease_until>now()) order by expires_at,id limit 100 for update skip locked);
 get diagnostics total=row_count;
 delete from public.moderation_receipts where operation in(select operation from public.moderation_receipts where created_at<=now()-interval '24 hours' order by created_at limit 500);
 return total;
end $$;
do $$ declare fn regprocedure;begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and (p.proname like 'distribution_moderation_%' or p.proname='moderation_profile_removed') loop
  execute format('revoke all on function %s from public,anon,authenticated',fn);
  if fn::text not like '%moderation_profile_removed%' then execute format('grant execute on function %s to service_role',fn);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
