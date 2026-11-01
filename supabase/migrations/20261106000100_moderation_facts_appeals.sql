begin;
set local lock_timeout='5s';

create table public.moderation_facts(
 id uuid primary key default gen_random_uuid(),subject uuid not null references public.moderation_subjects(id),
 case_id uuid references public.moderation_cases(id) on delete set null,case_reference uuid,
 reference text not null check(length(reference) between 4 and 120),summary text not null check(length(summary) between 20 and 5000),
 fingerprint text not null check(fingerprint~'^[a-f0-9]{64}$'),historical boolean not null default false,
 revision integer not null default 1 check(revision>0),state text not null default 'open' check(state in ('open','closed')),
 archived_at timestamptz,created_at timestamptz not null default clock_timestamp(),unique(subject,reference),unique(subject,fingerprint),unique(subject,case_reference)
);
create index moderation_facts_subject on public.moderation_facts(subject,created_at desc,id desc);
alter table public.moderation_measures add column fact_id uuid references public.moderation_facts(id);
alter table public.moderation_measures add column fact_revision integer;
alter table public.moderation_appeals add column effect text check(effect in ('none','withdraw_warning','lift_current'));
alter table public.moderation_appeals add column review_operation uuid unique;
alter table public.moderation_appeals add column review_hash text;
create table public.moderation_fact_events(
 id uuid primary key default gen_random_uuid(),fact_id uuid not null references public.moderation_facts(id),revision integer not null,
 action text not null check(action in ('historical','opened','accepted','reopened')),reason text check(length(reason) between 10 and 5000),
 actor uuid references auth.users(id) on delete set null,actor_reference uuid,appeal_id uuid references public.moderation_appeals(id) on delete set null,
 operation_hash text,created_at timestamptz not null default clock_timestamp()
);
create index moderation_fact_events_fact on public.moderation_fact_events(fact_id,created_at desc,id desc);
create table public.moderation_warning_withdrawals(
 id uuid primary key,measure_id uuid not null unique references public.moderation_measures(id),
 actor uuid references auth.users(id) on delete set null,actor_reference uuid not null,reason text not null check(length(reason) between 10 and 5000),
 operation_hash text not null,created_at timestamptz not null default clock_timestamp()
);
do $$declare t text;begin
 foreach t in array array['moderation_facts','moderation_fact_events','moderation_warning_withdrawals'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to service_role',t);
 end loop;
end $$;

-- Les dossiers existants sont regroupés sans inventer la nature des faits historiques.
insert into public.moderation_facts(subject,case_id,case_reference,reference,summary,fingerprint,historical,revision,state)
 select m.subject,m.case_id,m.case_id,'signalement-'||m.case_id::text,'Faits historiques associés au signalement ; consulter les décisions conservées.',
 encode(sha256(convert_to('case:'||m.case_id::text,'UTF8')),'hex'),true,max(m.version),
 case when bool_or(exists(select 1 from public.moderation_appeals a where a.measure=m.id and a.state='accepted')) then 'closed' else 'open' end
 from public.moderation_measures m where m.case_id is not null and m.action in ('warn','suspend','ban','unpublish') group by m.subject,m.case_id;
update public.moderation_measures m set fact_id=f.id,fact_revision=m.version from public.moderation_facts f
 where m.subject=f.subject and m.case_id=f.case_id and m.action in ('warn','suspend','ban','unpublish');
do $$declare m public.moderation_measures;fact uuid;begin
 for m in select * from public.moderation_measures where fact_id is null and action in ('warn','suspend','ban','unpublish') order by subject,version loop
  insert into public.moderation_facts(subject,reference,summary,fingerprint,historical,revision,state)
   values(m.subject,'historique-'||m.id::text,'Faits non structurés de la décision historique ; aucun rapprochement automatique.',
    encode(sha256(convert_to('legacy:'||m.id::text,'UTF8')),'hex'),true,1,
    case when exists(select 1 from public.moderation_appeals where measure=m.id and state='accepted') then 'closed' else 'open' end) returning id into fact;
  update public.moderation_measures set fact_id=fact,fact_revision=1 where id=m.id;
 end loop;
end $$;
update public.moderation_measures m set fact_id=(select p.fact_id from public.moderation_measures p where p.subject=m.subject and p.version<m.version
 and ((m.action='lift' and p.action in ('suspend','ban')) or (m.action='restore' and p.action='unpublish')) order by p.version desc limit 1)
 where m.action in ('lift','restore');
insert into public.moderation_fact_events(fact_id,revision,action,reason)
 select id,revision,'historical','Référence historique ; l’effet des recours anciens n’est pas déduit automatiquement.' from public.moderation_facts;
create unique index moderation_measures_fact_revision on public.moderation_measures(fact_id,fact_revision) where action in ('warn','suspend','ban','unpublish');

create function public.moderation_measure_fact_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare context jsonb;f public.moderation_facts;key text;description text;hash text;case_row public.moderation_cases;begin
 if new.action in ('lift','restore') then
  select fact_id into new.fact_id from public.moderation_measures where subject=new.subject and version<new.version
   and ((new.action='lift' and action in ('suspend','ban')) or (new.action='restore' and action='unpublish')) order by version desc limit 1;
  return new;
 end if;
 -- Les imports contrôlés par le propriétaire SQL restent hors du contrat RPC.
 if current_setting('role',true) not in ('service_role','authenticated','anon') then return new;end if;
 context:=nullif(current_setting('chibasko.moderation_facts',true),'')::jsonb;
 if context is null or (context->>'operationId')::uuid is distinct from new.id then raise exception 'facts_required';end if;
 if new.case_id is not null then
  select * into case_row from public.moderation_cases where id=new.case_id for update;
  if case_row.state in ('dismissed','resolved') then raise exception 'facts_closed';end if;
 end if;
 if context ? 'factId' then
  select * into f from public.moderation_facts where id=(context->>'factId')::uuid and subject=new.subject for update;
  if not found then raise exception 'facts_conflict';end if;
  if new.case_id is not null and f.case_reference is distinct from new.case_id then raise exception 'facts_conflict';end if;
  if f.revision is distinct from (context->>'factsRevision')::integer then raise exception 'facts_conflict';end if;
 elsif new.case_id is not null then
  select * into f from public.moderation_facts where subject=new.subject and case_reference=new.case_id for update;
  if not found then
   insert into public.moderation_facts(subject,case_id,case_reference,reference,summary,fingerprint)
    values(new.subject,new.case_id,new.case_id,'signalement-'||new.case_id::text,case_row.description,
     encode(sha256(convert_to(regexp_replace(lower(btrim(case_row.description)),'[[:space:]]+',' ','g'),'UTF8')),'hex')) returning * into f;
  end if;
 else
  key:=regexp_replace(lower(btrim(context->>'factsKey')),'[[:space:]]+',' ','g');description:=btrim(context->>'factsSummary');
  if key is null or length(key) not between 4 and 120 or description is null or length(description) not between 20 and 5000 then raise exception 'facts_required';end if;
  hash:=encode(sha256(convert_to(regexp_replace(lower(description),'[[:space:]]+',' ','g'),'UTF8')),'hex');
  select * into f from public.moderation_facts where subject=new.subject and (reference=key or fingerprint=hash) for update;
  if not found then
   insert into public.moderation_facts(subject,reference,summary,fingerprint) values(new.subject,key,description,hash) returning * into f;
  elsif f.reference<>key or f.fingerprint<>hash then raise exception 'facts_conflict';end if;
 end if;
 if f.case_id is not null then
  select * into case_row from public.moderation_cases where id=f.case_id for update;
  if case_row.state in ('dismissed','resolved') then raise exception 'facts_closed';end if;
  new.case_id:=f.case_id;
 end if;
 if f.state='closed' then raise exception 'facts_closed';end if;
 if exists(select 1 from public.moderation_measures where fact_id=f.id and fact_revision=f.revision and action in ('warn','suspend','ban','unpublish')) then raise exception 'facts_already_decided';end if;
 if not exists(select 1 from public.moderation_fact_events where fact_id=f.id) then
  insert into public.moderation_fact_events(fact_id,revision,action,actor,actor_reference) values(f.id,f.revision,'opened',new.actor,new.actor_reference);
 end if;
 new.fact_id:=f.id;new.fact_revision:=f.revision;return new;
exception when unique_violation then raise exception 'facts_conflict';
end $$;
revoke all on function public.moderation_measure_fact_guard() from public,anon,authenticated,service_role;
create trigger moderation_measure_fact_guard before insert on public.moderation_measures for each row execute function public.moderation_measure_fact_guard();

create function public.distribution_moderation_facts(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' set statement_timeout='10s' as $$
declare f public.moderation_facts;s public.moderation_subjects;event public.moderation_fact_events;target uuid:=(p_input->>'target')::uuid;v_kind text:=p_input->>'kind';op uuid:=(p_input->>'operationId')::uuid;result jsonb;begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden';end if;
 if p_input->>'action'='reopen' then
  if op is null or length(btrim(coalesce(p_input->>'reason',''))) not between 10 and 5000 then raise exception 'invalid_request';end if;
  select * into event from public.moderation_fact_events where id=op;
  if found then
   if event.actor_reference=p_actor and event.operation_hash=encode(sha256(convert_to(p_input::text,'UTF8')),'hex') then return to_jsonb(event);end if;
   raise exception 'idempotency_conflict';
  end if;
  select ms.* into s from public.moderation_facts mf join public.moderation_subjects ms on ms.id=mf.subject where mf.id=(p_input->>'id')::uuid;
  if s.id is null or coalesce(s.user_id,s.game_id) is null then raise exception 'invalid_request';end if;
  perform pg_advisory_xact_lock(hashtextextended((case when s.kind='player' then 'account-moderation:' else 'game-moderation:' end)||coalesce(s.user_id,s.game_id)::text,0));
  perform id from public.moderation_subjects where id=s.id for update;
  select * into event from public.moderation_fact_events where id=op;
  if found then
   if event.actor_reference=p_actor and event.operation_hash=encode(sha256(convert_to(p_input::text,'UTF8')),'hex') then return to_jsonb(event);end if;
   raise exception 'idempotency_conflict';
  end if;
  select * into f from public.moderation_facts where id=(p_input->>'id')::uuid for update;
  if f.revision is distinct from (p_input->>'revision')::integer then raise exception 'facts_conflict';end if;
  if f.archived_at is not null then raise exception 'decision_archived';end if;
  if f.state='open' and not exists(select 1 from public.moderation_measures where fact_id=f.id and fact_revision=f.revision and action in ('warn','suspend','ban','unpublish')) then raise exception 'facts_conflict';end if;
  if f.case_id is not null then
   update public.moderation_cases set state='review',justification=btrim(p_input->>'reason'),version=version+1,closed_at=null,expires_at=null,updated_at=clock_timestamp()
    where id=f.case_id and state in ('dismissed','resolved');
   if found then insert into public.moderation_events(case_id,actor,actor_reference,version,state,justification)
    select id,p_actor,p_actor,version,'review',btrim(p_input->>'reason') from public.moderation_cases where id=f.case_id;end if;
  end if;
  update public.moderation_facts set state='open',revision=revision+1,archived_at=null where id=f.id returning * into f;
  insert into public.moderation_fact_events(id,fact_id,revision,action,reason,actor,actor_reference,operation_hash)
   values(op,f.id,f.revision,'reopened',btrim(p_input->>'reason'),p_actor,p_actor,encode(sha256(convert_to(p_input::text,'UTF8')),'hex')) returning * into event;
  update public.moderation_subjects set retain_until=greatest(retain_until,clock_timestamp()+make_interval(days=>retention_days)) where id=s.id;
  return to_jsonb(f);
 end if;
 if p_input ? 'action' then raise exception 'invalid_request';end if;
 if target is null or v_kind not in ('player','game') then raise exception 'invalid_request';end if;
 with batch as(select mf.*,exists(select 1 from public.moderation_measures m where m.fact_id=mf.id and m.fact_revision=mf.revision and m.action in ('warn','suspend','ban','unpublish')) as decided
  from public.moderation_facts mf join public.moderation_subjects ms on ms.id=mf.subject where (not p_input ? 'caseId' or mf.case_reference=(p_input->>'caseId')::uuid) and ((v_kind='player' and ms.user_id=target) or (v_kind='game' and ms.game_id=target))
   and (not p_input ? 'before' or (mf.created_at,mf.id)<((p_input->>'before')::timestamptz,(p_input->>'cursor')::uuid)) order by mf.created_at desc,mf.id desc limit 21)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from (select * from batch order by created_at desc,id desc limit 20) x),'[]'::jsonb),'hasMore',(select count(*) from batch)>20) into result;return result;
end $$;
revoke all on function public.distribution_moderation_facts(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.distribution_moderation_facts(uuid,jsonb) to service_role;

create function public.moderation_withdraw_warning(p_actor uuid,p_input jsonb,p_notify boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.moderation_measures;s public.moderation_subjects;w public.moderation_warning_withdrawals;op uuid:=(p_input->>'operationId')::uuid;begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden';end if;
 if op is null or length(btrim(coalesce(p_input->>'reason',''))) not between 10 and 5000 then raise exception 'invalid_request';end if;
 select * into w from public.moderation_warning_withdrawals where id=op;
 if found then
  if w.actor_reference=p_actor and w.operation_hash=encode(sha256(convert_to(p_input::text,'UTF8')),'hex') then return to_jsonb(w);end if;
  raise exception 'idempotency_conflict';
 end if;
 select * into m from public.moderation_measures where id=(p_input->>'measureId')::uuid;
 select * into s from public.moderation_subjects where id=m.subject;
 if m.id is null or m.action<>'warn' or s.user_id is null then raise exception 'invalid_request';end if;
 perform pg_advisory_xact_lock(hashtextextended('account-moderation:'||s.user_id::text,0));
 select * into s from public.moderation_subjects where id=m.subject for update;
 select * into w from public.moderation_warning_withdrawals where id=op;
 if found then
  if w.actor_reference=p_actor and w.operation_hash=encode(sha256(convert_to(p_input::text,'UTF8')),'hex') then return to_jsonb(w);end if;
  raise exception 'idempotency_conflict';
 end if;
 if s.version is distinct from (p_input->>'version')::integer then raise exception 'request_conflict';end if;
 if exists(select 1 from public.moderation_warning_withdrawals where measure_id=m.id) then raise exception 'request_conflict';end if;
 insert into public.moderation_warning_withdrawals(id,measure_id,actor,actor_reference,reason,operation_hash)
  values(op,m.id,p_actor,p_actor,btrim(p_input->>'reason'),encode(sha256(convert_to(p_input::text,'UTF8')),'hex')) returning * into w;
 update public.moderation_subjects set version=version+1,retain_until=greatest(retain_until,clock_timestamp()+make_interval(days=>retention_days)) where id=s.id returning * into s;
 if p_notify then insert into public.moderation_measure_mail(measure_id,recipient,kind,version,notice)
  values(m.id,s.user_id,'correction',s.version,jsonb_build_object('title','Retrait d’un avertissement','text','L’avertissement '||m.id::text||E' a été retiré.\n\n'||w.reason));end if;
 return to_jsonb(w);
end $$;
revoke all on function public.moderation_withdraw_warning(uuid,jsonb,boolean) from public,anon,authenticated,service_role;
create function public.distribution_moderation_warning_withdraw(p_actor uuid,p_input jsonb) returns jsonb
language sql security definer set search_path='' as $$select public.moderation_withdraw_warning(p_actor,p_input,true)$$;
revoke all on function public.distribution_moderation_warning_withdraw(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.distribution_moderation_warning_withdraw(uuid,jsonb) to service_role;
do $$declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.moderation_measure_mail'::regclass and contype='c'
  and conkey=array[(select attnum from pg_attribute where attrelid='public.moderation_measure_mail'::regclass and attname='kind')]::smallint[] loop
  execute format('alter table public.moderation_measure_mail drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.moderation_measure_mail add constraint moderation_measure_mail_kind_check check(kind in ('admin','receipt','decision','correction'));

create function public.moderation_appeal_facts_close() returns trigger
language plpgsql security definer set search_path='' as $$declare m public.moderation_measures;begin
 if old.state='pending' and new.state='accepted' then
  select * into m from public.moderation_measures where id=new.measure;
  if m.fact_id is not null then
   update public.moderation_facts set state='closed' where id=m.fact_id and revision=m.fact_revision;
   insert into public.moderation_fact_events(fact_id,revision,action,actor,actor_reference,appeal_id,reason)
    values(m.fact_id,m.fact_revision,'accepted',new.reviewer,new.reviewer_reference,new.id,'Recours accepté sur cette révision des faits.');
  end if;
 end if;return new;
end $$;
revoke all on function public.moderation_appeal_facts_close() from public,anon,authenticated,service_role;
create trigger moderation_appeal_facts_close after update on public.moderation_appeals for each row execute function public.moderation_appeal_facts_close();

create function public.moderation_fact_context(p_fact uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',f.id,'reference',f.reference,'summary',f.summary,'revision',f.revision,'state',f.state,'historical',f.historical,'case_id',f.case_id,
  'events',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from
   (select e.id,e.action,e.revision,e.reason,e.actor_reference,e.appeal_id,e.created_at,p.username as actor_name
    from public.moderation_fact_events e left join public.profiles p on p.id=e.actor where e.fact_id=f.id order by e.created_at desc,e.id desc limit 20) x),'[]'::jsonb))
 from public.moderation_facts f where id=p_fact
$$;
revoke all on function public.moderation_fact_context(uuid) from public,anon,authenticated,service_role;
create function public.moderation_enrich_target(p_result jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$begin
 if p_result ? 'current' then return p_result||jsonb_build_object('current',public.moderation_enrich_target(p_result->'current'));end if;
 return p_result||jsonb_build_object('history',coalesce((select jsonb_agg(item||jsonb_build_object(
  'facts',public.moderation_fact_context(m.fact_id),
  'withdrawal',(select jsonb_build_object('reason',w.reason,'created_at',w.created_at) from public.moderation_warning_withdrawals w where measure_id=m.id),
  'appeal',case when item->'appeal'<>'null'::jsonb then item->'appeal'||jsonb_build_object('effect',(select effect from public.moderation_appeals where measure=m.id)) else 'null'::jsonb end) order by ordinal)
  from jsonb_array_elements(coalesce(p_result->'history','[]'::jsonb)) with ordinality a(item,ordinal)
  join public.moderation_measures m on m.id=(item->>'id')::uuid),'[]'::jsonb));
end $$;
revoke all on function public.moderation_enrich_target(jsonb) from public,anon,authenticated,service_role;

create or replace function public.distribution_moderation_measure(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' set statement_timeout='10s' as $$
declare policy text;target uuid;kind text;action text:=p_input->>'action';begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden';end if;
 perform set_config('chibasko.moderation_facts',p_input::text,true);
 if exists(select 1 from public.moderation_measures where id=(p_input->>'operationId')::uuid and actor=p_actor
  and operation_hash=encode(sha256(convert_to((p_input-'retentionDays')::text,'UTF8')),'hex')) then
  return public.moderation_enrich_target(public.moderation_measure_apply(p_actor,p_input));
 end if;
 if action is not null and action not in ('lift','restore') then
  -- Le verrou protège aussi les décisions en cours lors d'une fermeture du périmètre.
  select mode into policy from public.moderation_measure_scope where id for share;
  if policy is null or policy not in ('qualification','general') then raise exception 'moderation_scope_disabled';end if;
  kind:=p_input->>'kind';target:=(p_input->>'target')::uuid;
  if kind='player' then
   if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=target and to_jsonb(u)->>'deleted_at' is null) then raise exception 'account_not_found';end if;
  elsif kind='game' then
   if not exists(select 1 from public.games where id=target) then raise exception 'game_not_found';end if;
  else raise exception 'invalid_request';end if;
  if policy='qualification' then
   perform id from public.moderation_qualification_targets where
    (kind='player' and user_id=target) or (kind='game' and game_id=target) for share;
   if not found then raise exception 'moderation_target_not_allowed';end if;
  end if;
 end if;
 return public.moderation_enrich_target(public.moderation_measure_apply(p_actor,p_input));
end $$;

create or replace function public.distribution_moderation_appeals(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare item public.moderation_appeals;subject_row public.moderation_subjects;action_row public.moderation_measures;v_effect text;op uuid:=(p_input->>'operationId')::uuid;
begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden';end if;
 if p_input ? 'id' then
  select m.* into action_row from public.moderation_measures m join public.moderation_appeals a on a.measure=m.id where a.id=(p_input->>'id')::uuid;
  select * into subject_row from public.moderation_subjects where id=action_row.subject;
  perform pg_advisory_xact_lock(hashtextextended((case when subject_row.kind='game' then 'game-moderation:' else 'account-moderation:' end)||coalesce(subject_row.user_id,subject_row.game_id)::text,0));
  select * into item from public.moderation_appeals where id=(p_input->>'id')::uuid for update;
  if found and item.review_operation=op and item.reviewer_reference=p_actor and item.review_hash=encode(sha256(convert_to(p_input::text,'UTF8')),'hex') then return to_jsonb(item);end if;
  if not found or item.version is distinct from (p_input->>'version')::integer or item.state<>'pending' then raise exception 'request_conflict';end if;
  if p_input->>'state' not in ('accepted','rejected') or length(btrim(coalesce(p_input->>'decision',''))) not between 10 and 5000 then raise exception 'invalid_request';end if;
  v_effect:=coalesce(p_input->>'effect',case when coalesce((p_input->>'lift')::boolean,false) then 'lift_current' else 'none' end);
  if p_input ? 'effect' and coalesce((p_input->>'lift')::boolean,false)<>(v_effect='lift_current') then raise exception 'invalid_request';end if;
  if v_effect not in ('none','withdraw_warning','lift_current') or (v_effect<>'none' and p_input->>'state'<>'accepted') or (v_effect='withdraw_warning' and action_row.action<>'warn') or (v_effect='lift_current' and action_row.action='warn') then raise exception 'invalid_request';end if;
  if v_effect='withdraw_warning' then
   perform public.moderation_withdraw_warning(p_actor,jsonb_build_object('measureId',item.measure,'operationId',op,'version',p_input->'subjectVersion','reason',p_input->>'decision'),false);
  end if;
  if v_effect='lift_current' then
   if p_input->>'state'<>'accepted' or coalesce(subject_row.user_id,subject_row.game_id) is null then raise exception 'invalid_request';end if;
   perform public.distribution_moderation_measure(p_actor,jsonb_build_object('kind',subject_row.kind,'target',coalesce(subject_row.user_id,subject_row.game_id),'action',case when subject_row.kind='player' then 'lift' else 'restore' end,'version',p_input->'subjectVersion',
    'operationId',p_input->'operationId','reason',p_input->>'decision','note','Levée explicitement décidée lors du réexamen.'));
  end if;
  update public.moderation_subjects set retain_until=greatest(clock_timestamp(),ends_at)+make_interval(days=>retention_days) where id=subject_row.id;
  update public.moderation_appeals set effect=v_effect,review_operation=op,review_hash=encode(sha256(convert_to(p_input::text,'UTF8')),'hex'),state=p_input->>'state',decision=btrim(p_input->>'decision'),reviewer=p_actor,reviewer_reference=p_actor,reviewed_at=clock_timestamp(),version=version+1 where id=item.id;
 end if;
 return coalesce((select jsonb_agg(x order by x.created_at,x.id) from
  (select a.*,m.reason,m.action,s.user_id,s.game_id,s.kind,s.id as subject,s.version as subject_version,p.username,(select title from public.games where id=s.game_id) as game_title from public.moderation_appeals a join public.moderation_measures m on m.id=a.measure
   join public.moderation_subjects s on s.id=m.subject left join public.profiles p on p.id=a.author
   where a.state='pending' and (not p_input ? 'before' or (a.created_at,a.id)>((p_input->>'before')::timestamptz,(p_input->>'cursor')::uuid)) order by a.created_at,a.id limit 20) x),'[]'::jsonb);
end $$;

create or replace function public.moderation_appeal_notify() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into public.moderation_measure_mail(measure_id,kind,version,notice)
   values(new.measure,'admin',1,jsonb_build_object('title','Recours à examiner','text','Un recours attend un réexamen administratif. Référence : '||new.id::text));
 elsif old.state='pending' and new.state<>'pending' and new.author is not null then
  insert into public.moderation_measure_mail(measure_id,recipient,kind,version,notice)
   values(new.measure,new.author,'receipt',new.version,jsonb_build_object('title','Décision sur le recours','text',new.decision||case new.effect when 'withdraw_warning' then E'\n\nEffet : l’avertissement contesté est retiré ; aucune autre restriction n’est levée.' when 'lift_current' then E'\n\nEffet : la restriction actuelle est levée.' else E'\n\nEffet : aucune décision n’est retirée et aucune restriction n’est levée.' end));
 end if;
 return new;
end $$;

create or replace function public.moderation_measure_summary(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',m.id,'subject',m.subject,'action',m.action,'reason',left(m.reason,180),
  'created_at',m.created_at,'ends_at',m.ends_at,'archived_at',m.archived_at,'version',m.version,
  'actor_name',p.username,'actor_reference',m.actor_reference,'kind',s.kind,'target',coalesce(s.user_id,s.game_id),
  'name',coalesce(t.username,g.title),'current_version',s.version,
  'blocked',coalesce((s.user_id is not null and (s.measure='ban' or (s.measure='suspend' and s.ends_at>statement_timestamp()))) or (s.game_id is not null and s.measure='unpublish'),false),
  'protected',exists(select 1 from public.admin_users where user_id=s.user_id),
  'facts',public.moderation_fact_context(m.fact_id),'withdrawal',(select jsonb_build_object('id',w.id,'reason',w.reason,'created_at',w.created_at,'actor_reference',w.actor_reference) from public.moderation_warning_withdrawals w where w.measure_id=m.id),
  'state',case when exists(select 1 from public.moderation_warning_withdrawals where measure_id=m.id) then 'withdrawn' when m.action='warn' then 'warning' when m.action in ('lift','restore') then 'recorded'
   when m.action='suspend' and m.ends_at<=coalesce(n.created_at,statement_timestamp()) then 'expired'
   when n.action in ('lift','restore') then 'lifted' when n.id is not null then 'replaced'
   when coalesce(s.user_id,s.game_id) is null then 'unavailable'
   when s.measure=m.action then 'active' else 'closed' end,
  'next',case when n.id is not null then jsonb_build_object('id',n.id,'action',n.action,'created_at',n.created_at) end)
 from public.moderation_measures m join public.moderation_subjects s on s.id=m.subject
 left join public.profiles p on p.id=m.actor left join public.profiles t on t.id=s.user_id left join public.games g on g.id=s.game_id
 left join lateral(select x.id,x.action,x.created_at from public.moderation_measures x
  where x.subject=m.subject and x.version>m.version and x.action<>'warn' order by x.version limit 1) n on true
 where m.id=p_id
$$;

create or replace function public.distribution_moderation_browse(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare view_name text:=p_input->>'view';requested uuid:=(p_input->>'id')::uuid;
 v_kind text:=coalesce(p_input->>'kind','');v_action text:=coalesce(p_input->>'action','');v_status text:=coalesce(p_input->>'state','');
 q text:=lower(ltrim(btrim(coalesce(p_input->>'search','')),'@'));
 before_at timestamptz:=(p_input->>'before')::timestamptz;cursor_id uuid:=(p_input->>'cursor')::uuid;result jsonb;
begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden';end if;
 if view_name is null or view_name not in ('measures','appeals','deliveries') or v_kind not in ('','player','game') or length(q)>100
  or v_action not in ('','warn','suspend','ban','lift','unpublish','restore') or (before_at is null)<>(cursor_id is null)
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('view','id','kind','action','state','search','before','cursor')) then raise exception 'invalid_request';end if;
 if view_name='deliveries' then
  if requested is null or not exists(select 1 from public.moderation_measures where id=requested) then raise exception 'invalid_request';end if;
  with batch as(select d.id,d.kind,d.state,d.attempts,d.created_at,d.recipient,p.username as recipient_name
   from public.moderation_measure_mail d left join public.profiles p on p.id=d.recipient
   where d.measure_id=requested and (before_at is null or (d.created_at,d.id)<(before_at,cursor_id)) order by d.created_at desc,d.id desc limit 21)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from (select * from batch order by created_at desc,id desc limit 20) x),'[]'::jsonb),'hasMore',(select count(*) from batch)>20) into result;
 elsif view_name='measures' then
  if v_status not in ('','active','expired','lifted','warning','replaced','recorded','unavailable','closed','withdrawn') then raise exception 'invalid_request';end if;
  if requested is not null then
   select public.moderation_measure_summary(m.id)||jsonb_build_object('reason',m.reason,'note',m.note,'case_id',m.case_id,
    'case_number',(select number from public.moderation_cases where id=m.case_id),
    'appeal',(select jsonb_build_object('id',a.id,'state',a.state,'effect',a.effect,'created_at',a.created_at,'reviewed_at',a.reviewed_at) from public.moderation_appeals a where a.measure=m.id))
   into result from public.moderation_measures m where m.id=requested;
  else
   with batch as(select m.created_at,m.id,public.moderation_measure_summary(m.id) as item
    from public.moderation_measures m join public.moderation_subjects s on s.id=m.subject
    left join public.profiles p on p.id=s.user_id left join public.games g on g.id=s.game_id
    where (v_kind='' or s.kind=v_kind) and (v_action='' or m.action=v_action)
     and (q='' or starts_with(lower(coalesce(p.username,g.title,'')),q))
     and (before_at is null or (m.created_at,m.id)<(before_at,cursor_id))
     and (v_status='' or public.moderation_measure_summary(m.id)->>'state'=v_status)
    order by m.created_at desc,m.id desc limit 21)
   select jsonb_build_object('items',coalesce((select jsonb_agg(item order by created_at desc,id desc) from (select * from batch order by created_at desc,id desc limit 20) x),'[]'::jsonb),'hasMore',(select count(*) from batch)>20) into result;
  end if;
 else
  if v_status not in ('','pending','accepted','rejected') or v_action<>'' then raise exception 'invalid_request';end if;
  if requested is not null then
   select jsonb_build_object('id',a.id,'version',a.version,'state',a.state,'effect',a.effect,'description',a.description,'decision',a.decision,
    'created_at',a.created_at,'reviewed_at',a.reviewed_at,'archived_at',a.archived_at,'username',p.username,
    'author',a.author,'reviewer_name',r.username,'reviewer_reference',a.reviewer_reference,'measure',public.moderation_measure_summary(a.measure))
   into result from public.moderation_appeals a left join public.profiles p on p.id=a.author left join public.profiles r on r.id=a.reviewer where a.id=requested;
  else
   with batch as(select a.id,a.state,a.effect,a.created_at,a.reviewed_at,p.username,left(a.description,180) as description,
    public.moderation_measure_summary(m.id) as measure
    from public.moderation_appeals a join public.moderation_measures m on m.id=a.measure join public.moderation_subjects s on s.id=m.subject
    left join public.profiles p on p.id=a.author left join public.profiles t on t.id=s.user_id left join public.games g on g.id=s.game_id
    where (v_status='' or a.state=v_status) and (v_kind='' or s.kind=v_kind)
     and (q='' or starts_with(lower(coalesce(p.username,'')),q) or starts_with(lower(coalesce(t.username,g.title,'')),q))
     and (before_at is null or (a.created_at,a.id)<(before_at,cursor_id)) order by a.created_at desc,a.id desc limit 21)
   select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from (select * from batch order by created_at desc,id desc limit 20) x),'[]'::jsonb),'hasMore',(select count(*) from batch)>20) into result;
  end if;
 end if;
 return result;
end $$;

alter function public.moderation_self_status(timestamptz,uuid) rename to moderation_self_status_core;
revoke all on function public.moderation_self_status_core(timestamptz,uuid) from public,anon,authenticated,service_role;
create function public.moderation_self_status(p_before timestamptz default null,p_cursor uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 result:=public.moderation_self_status_core(p_before,p_cursor);
 return result||jsonb_build_object('history',coalesce((select jsonb_agg(item||jsonb_build_object(
  'withdrawal',(select jsonb_build_object('reason',w.reason,'created_at',w.created_at) from public.moderation_warning_withdrawals w where w.measure_id=(item->>'id')::uuid),
  'appeal',case when item->'appeal'<>'null'::jsonb then item->'appeal'||jsonb_build_object('effect',(select effect from public.moderation_appeals where measure=(item->>'id')::uuid)) else 'null'::jsonb end) order by ordinal)
  from jsonb_array_elements(result->'history') with ordinality a(item,ordinal)),'[]'::jsonb));
end $$;
revoke all on function public.moderation_self_status(timestamptz,uuid) from public,anon;
grant execute on function public.moderation_self_status(timestamptz,uuid) to authenticated;

alter table public.moderation_warning_withdrawals add column archived_at timestamptz;
alter function public.distribution_moderation_archive() rename to moderation_archive_decisions_core;
revoke all on function public.moderation_archive_decisions_core() from public,anon,authenticated,service_role;
create function public.distribution_moderation_archive() returns integer
language plpgsql security definer set search_path='' set statement_timeout='5s' as $$declare total integer;changed integer;candidate record;begin
 total:=public.moderation_archive_decisions_core();
 -- Le verrou de cible sérialise l’expurgation avec toute décision ou réouverture.
 for candidate in select ms.id from public.moderation_subjects ms where public.moderation_archive_eligible(ms.id)
  and (exists(select 1 from public.moderation_facts mf where mf.subject=ms.id and mf.archived_at is null
        and not exists(select 1 from public.moderation_measures m where m.fact_id=mf.id and m.archived_at is null))
   or exists(select 1 from public.moderation_fact_events e join public.moderation_facts mf on mf.id=e.fact_id
       where mf.subject=ms.id and mf.archived_at is not null and e.reason is not null and e.reason<>'Justification expurgée selon la politique de conservation.')
   or exists(select 1 from public.moderation_warning_withdrawals w join public.moderation_measures m on m.id=w.measure_id
       where m.subject=ms.id and m.archived_at is not null and w.archived_at is null))
  order by ms.retain_until,ms.id limit 10 for update skip locked loop
  if not public.moderation_archive_eligible(candidate.id) then continue;end if;
  update public.moderation_facts set reference='archive-'||id::text,summary='Description des faits expurgée selon la politique de conservation.',archived_at=clock_timestamp()
   where id in(select mf.id from public.moderation_facts mf where mf.subject=candidate.id and mf.archived_at is null
    and not exists(select 1 from public.moderation_measures m where m.fact_id=mf.id and m.archived_at is null)
    order by mf.created_at,mf.id limit 100 for update skip locked);
  get diagnostics changed=row_count;total:=total+changed;
  update public.moderation_fact_events set reason='Justification expurgée selon la politique de conservation.'
   where id in(select e.id from public.moderation_fact_events e join public.moderation_facts mf on mf.id=e.fact_id
    where mf.subject=candidate.id and mf.archived_at is not null and e.reason is not null
     and e.reason<>'Justification expurgée selon la politique de conservation.' order by e.created_at,e.id limit 100 for update of e skip locked);
  get diagnostics changed=row_count;total:=total+changed;
  update public.moderation_warning_withdrawals set reason='Justification du retrait expurgée selon la politique de conservation.',archived_at=clock_timestamp()
   where id in(select w.id from public.moderation_warning_withdrawals w join public.moderation_measures m on m.id=w.measure_id
    where m.subject=candidate.id and w.archived_at is null and m.archived_at is not null order by w.created_at,w.id limit 100 for update of w skip locked);
  get diagnostics changed=row_count;total:=total+changed;
 end loop;
 return total;
end $$;
revoke all on function public.distribution_moderation_archive() from public,anon,authenticated;
grant execute on function public.distribution_moderation_archive() to service_role;
notify pgrst,'reload schema';
commit;
