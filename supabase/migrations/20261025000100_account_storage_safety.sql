begin;
set local lock_timeout='5s';

-- Les uploads du portail passent par R2 ; la lecture des anciens fichiers reste inchangée.
create policy chibasko_legacy_storage_no_insert on storage.objects as restrictive
 for insert to anon,authenticated with check(bucket_id not in ('avatars','game-thumbnails'));
create policy chibasko_legacy_storage_no_update on storage.objects as restrictive
 for update to anon,authenticated using(bucket_id not in ('avatars','game-thumbnails'))
 with check(bucket_id not in ('avatars','game-thumbnails'));

alter table public.game_account_deletions drop constraint game_account_deletions_last_error_check;
alter table public.game_account_deletions add constraint game_account_deletions_last_error_check
 check(last_error in ('dependencies_busy','review_required','shared_draft','storage_owned_objects','auth_unavailable','cleanup_unavailable','database_unavailable'));

create function public.distribution_account_storage_owned(p_actor uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from pg_catalog.pg_attribute where attrelid='storage.objects'::regclass and attname in ('owner','owner_id') and not attisdropped)
  or not exists(select 1 from pg_catalog.pg_attribute where attrelid='storage.buckets'::regclass and attname in ('owner','owner_id') and not attisdropped) then
  raise exception 'storage_ownership_schema_unknown';
 end if;
 return exists(select 1 from storage.objects o where p_actor::text in(nullif(to_jsonb(o)->>'owner_id',''),nullif(to_jsonb(o)->>'owner','')))
  or exists(select 1 from storage.buckets b where p_actor::text in(nullif(to_jsonb(b)->>'owner_id',''),nullif(to_jsonb(b)->>'owner','')));
end $$;
revoke all on function public.distribution_account_storage_owned(uuid) from public,anon,authenticated;
grant execute on function public.distribution_account_storage_owned(uuid) to service_role;

-- Le contrôle reste dans la transaction de préparation, avant toute suppression personnelle.
do $$ declare definition text; marker text:='v_actor:=j.target_user_id;';begin
 select pg_get_functiondef('public.distribution_account_prepare(uuid,uuid)'::regprocedure) into definition;
 if position(marker in definition)=0 then raise exception 'account_prepare_contract_unknown'; end if;
 definition:=replace(definition,marker,marker||$guard$
 if public.distribution_account_storage_owned(v_actor) then
  update public.game_account_deletions set state='review_required',lease_token=null,lease_until=null,last_error='storage_owned_objects' where id=p_id;
  return 'review_required';
 end if;
$guard$);
 execute definition;
 select pg_get_functiondef('public.distribution_account_review(uuid,uuid,text)'::regprocedure) into definition;
 marker:='set attention_required=false,attempts=0,next_attempt_at=now() where id=p_id;';
 if position(marker in definition)=0 then raise exception 'account_review_contract_unknown'; end if;
 definition:=replace(definition,marker,$review$set attention_required=false,attempts=0,next_attempt_at=now(),
 state=case when state='review_required' and last_error='storage_owned_objects' then 'pending' else state end where id=p_id;$review$);
 execute definition;
end $$;
commit;
