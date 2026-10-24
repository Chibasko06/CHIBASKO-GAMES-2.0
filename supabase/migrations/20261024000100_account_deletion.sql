begin;
set local lock_timeout='5s';

-- Une autorité de gestion n'est ni un compte Auth, ni un titulaire de droits d'auteur.
create table public.game_management_authorities(id text primary key, name text not null);
insert into public.game_management_authorities values('chibasko_games','Chibasko Games');
create table public.game_account_deletions(
 id uuid primary key default gen_random_uuid(),
 subject_hash text not null unique,
 target_user_id uuid,
 requested_by uuid references auth.users(id) on delete set null,
 state text not null default 'pending' check(state in ('pending','review_required','preparing','prepared','cleanup_pending','completed','cancelled')),
 review_reference text check(review_reference ~ '^[A-Za-z0-9_./-]{1,160}$'),
 reviewed_by uuid references auth.users(id) on delete set null,
 approved_games uuid[],
 created_at timestamptz not null default now(), completed_at timestamptz,
 lease_token uuid,lease_until timestamptz,
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 last_error text check(last_error in ('dependencies_busy','review_required','shared_draft','auth_unavailable','cleanup_unavailable','database_unavailable')),
 attention_required boolean not null default false,
 check((lease_token is null)=(lease_until is null))
);
create index game_account_deletions_pending on public.game_account_deletions(next_attempt_at) where state in ('pending','prepared','cleanup_pending');
create table public.game_account_deletion_games(
 job_id uuid not null references public.game_account_deletions(id), game_id uuid not null,
 disposition text not null check(disposition in ('retain','purge')),primary key(job_id,game_id)
);
create table public.game_platform_management(
 game_id uuid primary key references public.games(id) on delete restrict,
 authority_id text not null references public.game_management_authorities(id),
 deletion_job_id uuid not null references public.game_account_deletions(id),
 transferred_at timestamptz not null default now()
);
create table public.game_account_cleanup(
 id uuid primary key default gen_random_uuid(),job_id uuid not null references public.game_account_deletions(id),
 kind text not null check(kind in ('staging','artifacts','avatars','cover')),
 object_key text, multipart_id text, owner_id uuid,
 cursor text, done boolean not null default false,
 unique(job_id,kind,object_key)
);
create table public.game_account_retired_assets(key_hash text primary key,job_id uuid not null references public.game_account_deletions(id));
create table public.game_account_deletion_events(
 id bigint generated always as identity primary key,job_id uuid not null references public.game_account_deletions(id),
 state text not null,created_at timestamptz not null default now()
);
do $$ declare t text;begin
 foreach t in array array['game_management_authorities','game_account_deletions','game_account_deletion_games','game_platform_management','game_account_cleanup','game_account_retired_assets','game_account_deletion_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to service_role',t);
 end loop;
end $$;
revoke all on sequence public.game_account_deletion_events_id_seq from public,anon,authenticated,service_role;
create function public.distribution_account_audit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.state is distinct from old.state then
  insert into public.game_account_deletion_events(job_id,state) values(new.id,new.state);
 end if;
 return new;
end $$;
create trigger account_deletion_audit after insert or update of state on public.game_account_deletions for each row execute function public.distribution_account_audit();

create function public.distribution_account_pending(p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.game_account_deletions where target_user_id=p_actor and state not in ('completed','cancelled'))
$$;
create or replace function public.distribution_managed_catalog(p_actor uuid,p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
begin
 if p_actor is null then raise exception 'unauthorized'; end if;
 if p_offset<0 or p_offset>100000 then raise exception 'invalid_request'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'title',x.title) order by x.title,x.id)
 from (select g.id,g.title from public.games g
 where (exists(select 1 from public.game_developer_members m where m.game_id=g.id and m.user_id=p_actor)
  or (exists(select 1 from public.admin_users where user_id=p_actor)
   and exists(select 1 from public.game_platform_management p where p.game_id=g.id and p.authority_id='chibasko_games')))
 and (not exists(select 1 from public.game_developer_registrations r where r.game_id=g.id)
  or exists(select 1 from public.game_versions v where v.game_id=g.id and v.status='published'))
 order by g.title,g.id limit 50 offset p_offset) x),'[]');
end $$;
create function public.distribution_account_write_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 actor:=(to_jsonb(new)->>tg_argv[0])::uuid;
 if current_setting('role',true) in ('anon','authenticated') and actor is distinct from auth.uid() then
  raise exception using errcode='42501',message='forbidden';
 end if;
 perform id from auth.users where id=actor for key share;
 if actor is not null and public.distribution_account_pending(actor) then
  raise exception using errcode='55000',message='account_deletion_pending';
 end if;
 return new;
end $$;
create trigger account_profile_guard before insert or update on public.profiles for each row execute function public.distribution_account_write_guard('id');
create trigger account_contact_guard before insert or update on public.developer_contacts for each row execute function public.distribution_account_write_guard('user_id');
create trigger account_registration_guard before insert on public.game_developer_registrations for each row execute function public.distribution_account_write_guard('actor');
create trigger account_membership_guard before insert or update on public.game_developer_members for each row execute function public.distribution_account_write_guard('user_id');
create trigger account_upload_guard before insert or update on public.game_build_uploads for each row execute function public.distribution_account_write_guard('created_by');

create function public.distribution_account_request(p_actor uuid,p_target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.game_account_deletions; fingerprint text;
begin
 if p_actor is null or p_target is null or (p_actor<>p_target and not exists(select 1 from public.admin_users where user_id=p_actor)) then
  raise exception using errcode='42501',message='forbidden';
 end if;
 fingerprint:=encode(sha256(convert_to(p_target::text,'UTF8')),'hex');
 if p_actor<>p_target then
  perform user_id from public.admin_users where user_id=p_actor for key share;
  if not found then raise exception using errcode='42501',message='forbidden'; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_target::text,719));
 select * into j from public.game_account_deletions where subject_hash=fingerprint for update;
 if found and j.state<>'cancelled' then return jsonb_build_object('id',j.id,'state',j.state); end if;
 perform id from auth.users where id=p_target for update;
 if not found then raise exception using errcode='P0002',message='account_not_found'; end if;
 if exists(select 1 from public.admin_users where user_id=p_target) and (select count(*) from public.admin_users)<2 then raise exception 'last_admin'; end if;
 insert into public.game_account_deletions(subject_hash,target_user_id,requested_by,state)
 values(fingerprint,p_target,p_actor,case when exists(
  select 1 from public.games g where (g.is_published or exists(select 1 from public.game_versions v where v.game_id=g.id and v.published_at is not null))
  and (exists(select 1 from public.game_developer_members m where m.game_id=g.id and m.user_id=p_target and m.role='owner')
   or exists(select 1 from public.game_developer_registrations r where r.game_id=g.id and r.actor=p_target))
 ) then 'review_required' else 'pending' end)
 on conflict(subject_hash) do update set target_user_id=excluded.target_user_id,requested_by=excluded.requested_by,state=excluded.state,
  review_reference=null,approved_games=null,reviewed_by=null,attempts=0,attention_required=false,next_attempt_at=now(),last_error=null
 where game_account_deletions.state='cancelled' returning * into j;
 return jsonb_build_object('id',j.id,'state',j.state);
end $$;

create function public.distribution_account_review(p_actor uuid,p_id uuid,p_reference text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.game_account_deletions;
begin
 perform user_id from public.admin_users where user_id=p_actor for key share;
 if not found then raise exception using errcode='42501',message='forbidden'; end if;
 select * into strict j from public.game_account_deletions where id=p_id for update;
 if p_reference is not null then
  if j.state not in ('pending','review_required') or p_reference !~ '^[A-Za-z0-9_./-]{1,160}$' then raise exception 'invalid_request'; end if;
  update public.game_account_deletions set review_reference=p_reference,reviewed_by=p_actor,state='pending',attention_required=false,next_attempt_at=now(),
   approved_games=array(select g.id from public.games g where (g.is_published or exists(select 1 from public.game_versions v where v.game_id=g.id and v.published_at is not null))
    and (exists(select 1 from public.game_developer_members m where m.game_id=g.id and m.user_id=j.target_user_id and m.role='owner')
     or exists(select 1 from public.game_developer_registrations r where r.game_id=g.id and r.actor=j.target_user_id)) order by g.id)
   where id=p_id;
 else
  update public.game_account_deletions set attention_required=false,attempts=0,next_attempt_at=now() where id=p_id;
 end if;
 return jsonb_build_object('id',p_id,'state',(select state from public.game_account_deletions where id=p_id));
end $$;

create function public.distribution_account_claim(p_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.game_account_deletions;
begin
 select * into j from public.game_account_deletions where state in ('pending','prepared','cleanup_pending') and not attention_required
  and next_attempt_at<=now() and (lease_until is null or lease_until<now()) and (p_id is null or id=p_id)
 order by next_attempt_at,created_at,id for update skip locked limit 1;
 if not found then return null; end if;
 update public.game_account_deletions set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
 where id=j.id returning * into j;
 return jsonb_build_object('id',j.id,'target',j.target_user_id,'state',j.state,'lease',j.lease_token);
end $$;

create function public.distribution_account_list(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception using errcode='42501',message='forbidden'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'state',j.state,'createdAt',j.created_at,
  'attentionRequired',j.attention_required,'reason',j.last_error) order by j.created_at,j.id)
  from (select * from public.game_account_deletions where state not in ('completed','cancelled') order by created_at,id limit 50) j),'[]');
end $$;
create function public.distribution_account_status(p_actor uuid,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare j public.game_account_deletions;
begin
 select * into strict j from public.game_account_deletions where id=p_id;
 if p_actor is null or (p_actor is distinct from j.target_user_id and not exists(select 1 from public.admin_users where user_id=p_actor)) then raise exception using errcode='42501',message='forbidden'; end if;
 return jsonb_build_object('id',j.id,'state',j.state,'attentionRequired',j.attention_required,'reason',j.last_error);
end $$;
create function public.distribution_account_cancel(p_actor uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j public.game_account_deletions;
begin
 select * into strict j from public.game_account_deletions where id=p_id for update;
 if p_actor is null or (p_actor is distinct from j.target_user_id and not exists(select 1 from public.admin_users where user_id=p_actor)) then raise exception using errcode='42501',message='forbidden'; end if;
 if j.state not in ('pending','review_required') or j.lease_until>now() then raise exception 'invalid_state'; end if;
 update public.game_account_deletions set state='cancelled',target_user_id=null,lease_token=null,lease_until=null where id=p_id;
end $$;

-- Le purgateur reçoit une exception étroite à l'immuabilité : aucune version publiée.
do $$ declare definition text;begin
 select pg_get_functiondef('public.guard_game_version()'::regprocedure) into definition;
 if position('if tg_op=''DELETE'' then raise exception ''Archive versions instead of deleting them''; end if;' in definition)=0 then
  raise exception 'Version du garde d''immutabilité inconnue';
 end if;
 definition:=replace(definition,'if tg_op=''DELETE'' then raise exception ''Archive versions instead of deleting them''; end if;',
 $guard$if tg_op='DELETE' then
  if old.published_at is null and current_user=pg_get_userbyid((select relowner from pg_class where oid='public.game_versions'::regclass))
   and exists(select 1 from public.game_account_deletion_games t join public.game_account_deletions j on j.id=t.job_id
    where t.game_id=old.game_id and t.disposition='purge' and j.state='preparing' and j.lease_until>now()
     and j.id::text=current_setting('chibasko.account_deletion_job',true)) then return old; end if;
  raise exception 'Archive versions instead of deleting them';
 end if;$guard$);
 execute definition;
end $$;

create function public.distribution_account_prepare(p_id uuid,p_lease uuid) returns text
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare j public.game_account_deletions; v_actor uuid; game_record record; upload_record record; image text;
begin
 select * into strict j from public.game_account_deletions where id=p_id for update;
 if j.lease_token is distinct from p_lease or j.lease_until<=now() then raise exception 'lease_lost'; end if;
 if j.state<>'pending' then return j.state; end if;
 v_actor:=j.target_user_id;
 if exists(select 1 from public.admin_users where user_id=v_actor) then
  perform pg_advisory_xact_lock(718,1);
  perform user_id from public.admin_users where user_id=v_actor for update;
 end if;
 perform id from auth.users where id=v_actor for update;
 if not found then raise exception 'account_not_found'; end if;
 if exists(select 1 from public.admin_users where user_id=v_actor) and (select count(*) from public.admin_users)<2 then raise exception 'last_admin'; end if;
 perform g.id from public.games g where exists(select 1 from public.game_developer_members m where m.game_id=g.id and m.user_id=v_actor and m.role='owner')
  or exists(select 1 from public.game_developer_registrations r where r.game_id=g.id and r.actor=v_actor) order by g.id for update;
 for game_record in select g.id,g.is_published or exists(select 1 from public.game_versions v where v.game_id=g.id and v.published_at is not null) as published
  from public.games g where exists(select 1 from public.game_developer_members m where m.game_id=g.id and m.user_id=v_actor and m.role='owner')
  or exists(select 1 from public.game_developer_registrations r where r.game_id=g.id and r.actor=v_actor) order by g.id loop
  if game_record.published and (j.review_reference is null or not (game_record.id=any(coalesce(j.approved_games,'{}')))) then
   update public.game_account_deletions set state='review_required',lease_token=null,lease_until=null,last_error='review_required' where id=p_id;
   return 'review_required';
  end if;
  if not game_record.published and exists(select 1 from public.game_developer_members where game_id=game_record.id and user_id<>v_actor) then
   update public.game_account_deletions set state='review_required',lease_token=null,lease_until=null,last_error='shared_draft' where id=p_id;
   return 'review_required';
  end if;
 end loop;
 insert into public.game_account_deletion_games(job_id,game_id,disposition)
 select p_id,g.id,case when g.is_published or exists(select 1 from public.game_versions v where v.game_id=g.id and v.published_at is not null) then 'retain' else 'purge' end
 from public.games g where exists(select 1 from public.game_developer_members m where m.game_id=g.id and m.user_id=v_actor and m.role='owner')
  or exists(select 1 from public.game_developer_registrations r where r.game_id=g.id and r.actor=v_actor);
 -- Verrouille les messages avant de vérifier les leases des appels externes.
 perform n.submission_id from public.game_submission_notifications n join public.game_submissions s on s.id=n.submission_id
  join public.game_build_uploads u on u.id=s.build_upload_id where u.created_by=v_actor or u.game_id in
  (select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge') for update of n;
 -- Attend les opérations externes déjà parties avant de supprimer leurs traces.
 if exists(select 1 from public.game_build_uploads where (created_by=v_actor or game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge')) and lease_until>now())
  or exists(select 1 from public.game_submission_notifications n join public.game_submissions s on s.id=n.submission_id
    join public.game_build_uploads u on u.id=s.build_upload_id where (u.created_by=v_actor or u.game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge')) and n.lease_until>now()) then raise exception 'dependencies_busy'; end if;
 update public.game_account_deletions set state='preparing' where id=p_id;
 perform set_config('chibasko.account_deletion_job',p_id::text,true);
 insert into public.game_platform_management(game_id,authority_id,deletion_job_id)
 select game_id,'chibasko_games',p_id from public.game_account_deletion_games where job_id=p_id and disposition='retain'
 on conflict(game_id) do nothing;
 insert into public.game_account_cleanup(job_id,kind,object_key,owner_id)
 values(p_id,'avatars','avatars/'||v_actor::text||'/',v_actor);
 insert into public.game_account_cleanup(job_id,kind,object_key)
 select p_id,'artifacts','games/'||game_id::text||'/' from public.game_account_deletion_games where job_id=p_id and disposition='purge';
 for upload_record in select * from public.game_build_uploads where created_by=v_actor or game_id in
  (select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge') for update loop
  insert into public.game_account_cleanup(job_id,kind,object_key,multipart_id) values(p_id,'staging',upload_record.staging_key,case when upload_record.status in ('created','uploading','finalizing') then upload_record.multipart_id end) on conflict do nothing;
 end loop;
 for image in select cover_image_url from public.game_submissions where build_upload_id in (select id from public.game_build_uploads where created_by=v_actor)
  union select thumbnail_url from public.games where id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge') loop
  if image ~ '^https://assets[.]chibaskogames[.]fr/game-thumbnails/[a-f0-9-]{36}[.](png|jpg|webp|gif|avif|svg|ico)$' then
   insert into public.game_account_cleanup(job_id,kind,object_key) values(p_id,'cover',substr(image,length('https://assets.chibaskogames.fr/')+1)) on conflict do nothing;
  end if;
 end loop;
 delete from public.game_submission_notifications where submission_id in(select id from public.game_submissions where build_upload_id in(select id from public.game_build_uploads where created_by=v_actor or game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge')));
 delete from public.game_submissions where build_upload_id in(select id from public.game_build_uploads where created_by=v_actor or game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge'));
 delete from public.game_submission_drafts where created_by=v_actor or game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge');
 delete from public.game_developer_registrations r where r.actor=j.target_user_id;
 delete from public.game_connection_tickets where launch_id in(select l.id from public.game_launch_sessions l where l.issued_by=v_actor or l.version_id in
  (select id from public.game_versions where game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge')));
 delete from public.game_preview_sessions where issued_by=v_actor or version_id in(select id from public.game_versions where game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge'));
 delete from public.game_launch_sessions where issued_by=v_actor or version_id in(select id from public.game_versions where game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge'));
 delete from public.multiplayer_lobby_rounds where lobby_id in(select id from public.multiplayer_lobbies where game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge'));
 delete from public.multiplayer_lobby_members where actor_id=v_actor or lobby_id in(select id from public.multiplayer_lobbies where game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge'));
 update public.multiplayer_lobbies set leader_actor=null where leader_actor=v_actor;
 delete from public.multiplayer_lobbies where game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge');
 delete from public.game_online_participants where actor_id=v_actor or session_id in(select s.id from public.game_online_sessions s join public.game_versions v on v.id=s.version_id where v.game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge'));
 delete from public.game_online_sessions where version_id in(select id from public.game_versions where game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge'));
 delete from public.game_server_credentials where deployment_id in(select id from public.game_server_deployments where game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge'));
 delete from public.game_server_deployment_versions where game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge');
 delete from public.game_server_deployments where game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge');
 delete from public.game_version_delivery_policies where version_id in(select id from public.game_versions where game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge'));
 delete from public.game_build_review_events where upload_id in(select id from public.game_build_uploads where game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge'));
 update public.game_build_review_events e set actor=null where e.actor=j.target_user_id;
 delete from public.game_build_reviews where upload_id in(select id from public.game_build_uploads where game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge'));
 delete from public.game_build_outbox where upload_id in(select id from public.game_build_uploads where game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge'));
 update public.game_build_uploads set created_by=null,lease_token=null,lease_until=null,
  status=case when status in ('created','uploading','finalizing','queued','validating') then 'failed' else status end,
  multipart_id=null,checkpoint=null where created_by=j.target_user_id;
 delete from public.game_build_uploads where game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge');
 update public.games set active_version_id=null where id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge');
 delete from public.game_versions where game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge');
 update public.game_versions set created_by=null where created_by=j.target_user_id;
 delete from public.game_developer_members where user_id=v_actor or game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge');
 delete from public.multiplayer_game_policies where game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge');
 delete from public.game_categories where game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge');
 delete from public.game_reviews where user_id=v_actor or game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge');
 delete from public.game_reactions where user_id=v_actor or game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge');
 delete from public.favorites where user_id=v_actor or game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge');
 delete from public.play_history where user_id=v_actor or game_id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge');
 delete from public.games where id in(select game_id from public.game_account_deletion_games where job_id=p_id and disposition='purge');
 delete from public.developer_contacts where user_id=v_actor;
 delete from public.profiles where id=v_actor;
 delete from public.password_reset_codes where user_id=v_actor or email in(select email from auth.users where id=v_actor);
 delete from public.game_build_api_limits a where a.actor=j.target_user_id;
 delete from public.multiplayer_api_limits where actor_id=v_actor;
 delete from public.admin_users where user_id=v_actor;
 delete from public.game_reviewers where user_id=v_actor;
 update public.game_account_deletions set state='prepared' where id=p_id;
 return 'prepared';
end $$;

create function public.distribution_account_auth_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.game_account_deletions where target_user_id=old.id and state='prepared') then
  raise exception using errcode='55000',message='account_deletion_requires_preparation';
 end if;
 return old;
end $$;
create trigger account_deletion_guard before delete on auth.users for each row execute function public.distribution_account_auth_guard();

create function public.distribution_account_auth_deleted(p_id uuid,p_lease uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j public.game_account_deletions;
begin
 select * into strict j from public.game_account_deletions where id=p_id for update;
 if j.lease_token is distinct from p_lease or j.lease_until<=now() or j.state<>'prepared' then raise exception 'lease_lost'; end if;
 if exists(select 1 from auth.users where id=j.target_user_id) then raise exception 'auth_still_present'; end if;
 update public.game_account_deletions set state='cleanup_pending',target_user_id=null where id=p_id;
end $$;

create function public.distribution_account_cleanup_next(p_id uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare task public.game_account_cleanup;
begin
 if not exists(select 1 from public.game_account_deletions where id=p_id and lease_token=p_lease and lease_until>now() and state='cleanup_pending') then raise exception 'lease_lost'; end if;
 select * into task from public.game_account_cleanup where job_id=p_id and not done order by id limit 1;
 if not found then return null; end if;
 return jsonb_build_object('id',task.id,'kind',task.kind,'key',task.object_key,'multipart',task.multipart_id,'owner',task.owner_id,'cursor',task.cursor,'lease',p_lease);
end $$;
create function public.distribution_account_asset_referenced(p_key text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.games where strpos(thumbnail_url,p_key)>0)
 or exists(select 1 from public.profiles where strpos(avatar_url,p_key)>0)
 or exists(select 1 from public.game_submissions where strpos(cover_image_url,p_key)>0)
 or exists(select 1 from public.game_submission_drafts where strpos(metadata::text,p_key)>0)
$$;
create function public.distribution_account_cleanup_ack(p_id uuid,p_lease uuid,p_task uuid,p_cursor text,p_done boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.game_account_deletions where id=p_id and lease_token=p_lease and lease_until>now() and state='cleanup_pending') then raise exception 'lease_lost'; end if;
 update public.game_account_cleanup set cursor=p_cursor,done=p_done,
  object_key=case when p_done then null else object_key end,multipart_id=case when p_done then null else multipart_id end,
  owner_id=case when p_done then null else owner_id end where id=p_task and job_id=p_id and not done;
end $$;
create function public.distribution_account_reserve_asset(p_task uuid,p_lease uuid,p_key text) returns boolean
language plpgsql security definer set search_path='' as $$
declare t public.game_account_cleanup;
begin
 select resource.* into strict t from public.game_account_cleanup resource join public.game_account_deletions j on j.id=resource.job_id
 where resource.id=p_task and not resource.done and j.state='cleanup_pending' and j.lease_token=p_lease and j.lease_until>now();
 if not ((t.kind='cover' and p_key=t.object_key) or (t.kind='avatars' and starts_with(p_key,t.object_key))) then raise exception 'invalid_cleanup_scope'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key,720));
 if public.distribution_account_asset_referenced(p_key) then return false; end if;
 insert into public.game_account_retired_assets values(encode(sha256(convert_to(p_key,'UTF8')),'hex'),t.job_id) on conflict do nothing;
 return true;
end $$;
create function public.distribution_account_asset_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare key text;
begin
 if tg_table_name='games' and tg_op='INSERT' and exists(select 1 from public.game_account_deletion_games where game_id=(to_jsonb(new)->>'id')::uuid and disposition='purge') then raise exception 'game_identity_retired'; end if;
 for key in select distinct m.parts[1] from regexp_matches(to_jsonb(new)::text,'https://assets[.]chibaskogames[.]fr/((?:avatars/[a-f0-9-]{36}/|game-thumbnails/)[a-f0-9-]{36}[.](?:jpg|png|webp|gif|ico|avif|svg))','g') as m(parts) order by 1 loop
  perform pg_advisory_xact_lock(hashtextextended(key,720));
  if exists(select 1 from public.game_account_retired_assets where key_hash=encode(sha256(convert_to(key,'UTF8')),'hex')) then raise exception 'asset_retired'; end if;
 end loop;
 return new;
end $$;
create trigger account_asset_guard before insert or update on public.games for each row execute function public.distribution_account_asset_guard();
create trigger account_asset_guard before insert or update on public.profiles for each row execute function public.distribution_account_asset_guard();
create trigger account_asset_guard before insert or update on public.game_submissions for each row execute function public.distribution_account_asset_guard();
create trigger account_asset_guard before insert or update on public.game_submission_drafts for each row execute function public.distribution_account_asset_guard();
create function public.distribution_account_release(p_id uuid,p_lease uuid,p_error text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.game_account_deletions;
begin
 select * into strict j from public.game_account_deletions where id=p_id for update;
 if j.lease_token is distinct from p_lease or j.lease_until<=now() then raise exception 'lease_lost'; end if;
 if p_error is null and j.state='cleanup_pending' and not exists(select 1 from public.game_account_cleanup where job_id=p_id and not done) then
  update public.game_account_deletions set state='completed',completed_at=now(),lease_token=null,lease_until=null,last_error=null where id=p_id;
 else
  update public.game_account_deletions set lease_token=null,lease_until=null,last_error=p_error,
   attempts=case when p_error is null then 0 else attempts+1 end,
   attention_required=p_error is not null and attempts+1>=8,
   next_attempt_at=now()+make_interval(secs=>case when p_error is null then 30 else least(3600,30*(2^least(attempts+1,7))::integer) end) where id=p_id;
 end if;
 return jsonb_build_object('id',p_id,'state',(select state from public.game_account_deletions where id=p_id));
end $$;

-- Un claim de mail commencé avant la demande reste protégé par son lease.
do $$ declare definition text;begin
 select pg_get_functiondef('public.distribution_claim_submission_email(uuid)'::regprocedure) into definition;
 if position('where sent_at is null and attempts<8' in definition)=0 then raise exception 'Claim de notification inconnu'; end if;
 definition:=replace(definition,'where sent_at is null and attempts<8',
 'where not exists(select 1 from public.game_submissions s join public.game_build_uploads u on u.id=s.build_upload_id
  where s.id=game_submission_notifications.submission_id and public.distribution_account_pending(u.created_by)) and sent_at is null and attempts<8');
 execute definition;
end $$;

do $$ declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'distribution_account_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;
commit;
