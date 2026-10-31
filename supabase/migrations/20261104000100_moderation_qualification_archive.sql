begin;
set local lock_timeout='5s';

create table public.moderation_measure_scope(
 id boolean primary key default true check(id),
 mode text not null check(mode in ('disabled','qualification','general'))
);
insert into public.moderation_measure_scope values(true,'disabled');
create table public.moderation_qualification_targets(
 id uuid primary key default gen_random_uuid(),
 user_id uuid unique references auth.users(id) on delete cascade,
 game_id uuid unique references public.games(id) on delete cascade,
 check(num_nonnulls(user_id,game_id)=1)
);
alter table public.moderation_measure_scope enable row level security;
alter table public.moderation_qualification_targets enable row level security;
revoke all on public.moderation_measure_scope,public.moderation_qualification_targets from public,anon,authenticated,service_role;

-- La fonction interne conserve le contrat historique, sans accès privilégié direct.
alter function public.distribution_moderation_measure(uuid,jsonb) rename to moderation_measure_apply;
revoke all on function public.moderation_measure_apply(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.distribution_moderation_measure(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' set statement_timeout='10s' as $$
declare policy text;target uuid;kind text;action text:=p_input->>'action';begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden';end if;
 if exists(select 1 from public.moderation_measures where id=(p_input->>'operationId')::uuid and actor=p_actor
  and operation_hash=encode(sha256(convert_to((p_input-'retentionDays')::text,'UTF8')),'hex')) then
  return public.moderation_measure_apply(p_actor,p_input);
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
 return public.moderation_measure_apply(p_actor,p_input);
end $$;
revoke all on function public.distribution_moderation_measure(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.distribution_moderation_measure(uuid,jsonb) to service_role;

-- Une nouvelle décision ou un réexamen ne raccourcit pas une échéance déjà acquise.
create function public.moderation_retention_guard() returns trigger
language plpgsql set search_path='' as $$begin
 new.retain_until:=greatest(old.retain_until,new.retain_until);
 return new;
end $$;
revoke all on function public.moderation_retention_guard() from public,anon,authenticated,service_role;
create trigger moderation_retention_guard before update on public.moderation_subjects
for each row execute function public.moderation_retention_guard();

create function public.moderation_archive_eligible(p_subject uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.moderation_subjects s where s.id=p_subject and s.retain_until<=statement_timestamp()
  and not coalesce(s.user_id is not null and (s.measure='ban' or (s.measure='suspend' and s.ends_at>statement_timestamp())),false)
  and not coalesce(s.game_id is not null and s.measure='unpublish',false)
  and not exists(select 1 from public.moderation_appeals a join public.moderation_measures m on m.id=a.measure where m.subject=s.id and a.state='pending')
  and not exists(select 1 from public.moderation_measure_mail d join public.moderation_measures m on m.id=d.measure_id where m.subject=s.id and d.state<>'sent'))
$$;
revoke all on function public.moderation_archive_eligible(uuid) from public,anon,authenticated,service_role;

create or replace function public.distribution_moderation_archive() returns integer
language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare subject_row public.moderation_subjects;ids uuid[];total integer:=0;changed integer;begin
 for subject_row in select s.* from public.moderation_subjects s
  where s.retain_until<=statement_timestamp() and public.moderation_archive_eligible(s.id)
   and (exists(select 1 from public.moderation_measures m where m.subject=s.id and m.archived_at is null)
    or exists(select 1 from public.moderation_measure_mail d join public.moderation_measures m on m.id=d.measure_id
     where m.subject=s.id and m.archived_at is not null and d.state='sent' and (d.message is not null or d.notice<>'{}'::jsonb)))
  order by s.retain_until,s.id limit 10 for update skip locked
 loop
  if not public.moderation_archive_eligible(subject_row.id) then continue;end if;
  select array_agg(id) into ids from (select m.id from public.moderation_measures m where m.subject=subject_row.id and m.archived_at is null order by m.version limit 50) batch;
  update public.moderation_measures set reason='Justification archivée selon la politique de conservation.',note=null,archived_at=clock_timestamp() where id=any(ids);
  get diagnostics changed=row_count;total:=total+changed;
  update public.moderation_appeals set description='Texte du recours archivé selon la politique de conservation.',decision='Décision archivée.',archived_at=clock_timestamp() where measure=any(ids) and state<>'pending';
  -- Les reliquats sont repris indépendamment du lot de décisions déjà archivé.
  update public.moderation_measure_mail set notice='{}',message=null where id in
   (select d.id from public.moderation_measure_mail d join public.moderation_measures m on m.id=d.measure_id
    where m.subject=subject_row.id and m.archived_at is not null and d.state='sent' and (d.message is not null or d.notice<>'{}'::jsonb)
    order by d.created_at,d.id limit 100 for update of d skip locked);
  get diagnostics changed=row_count;total:=total+changed;
 end loop;
 return total;
end $$;
create index moderation_measure_mail_unfinished on public.moderation_measure_mail(measure_id) where state<>'sent';
create index moderation_measure_mail_payload on public.moderation_measure_mail(measure_id,created_at,id)
 where state='sent' and (message is not null or notice<>'{}'::jsonb);
notify pgrst,'reload schema';
commit;
