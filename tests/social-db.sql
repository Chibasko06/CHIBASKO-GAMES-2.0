begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('fe000000-0000-4000-8000-000000000001','social-a@example.test','{"username":"social-alpha"}'),
 ('fe000000-0000-4000-8000-000000000002','social-b@example.test','{"username":"social-beta"}'),
 ('fe000000-0000-4000-8000-000000000003','social-c@example.test','{"username":"social-gamma"}');
insert into public.admin_users(user_id) values('fe000000-0000-4000-8000-000000000003');
do $$ declare table_name text;role_name text;begin
 foreach table_name in array array['social_relationships','social_blocks','social_request_limits','social_request_cooldowns','social_operations'] loop
  if not (select relrowsecurity from pg_class where oid=('public.'||table_name)::regclass) then raise exception 'RLS absente';end if;
  foreach role_name in array array['anon','authenticated'] loop
   if has_any_column_privilege(role_name,'public.'||table_name,'SELECT') or has_table_privilege(role_name,'public.'||table_name,'INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'Privilège direct excessif';end if;
  end loop;
 end loop;
end $$;
set local role anon;
do $$ begin
 begin perform public.social_list('friends');raise exception 'Liste anonyme';exception when insufficient_privilege then null;end;
 begin perform public.social_change('block','fe000000-0000-4000-8000-000000000002',gen_random_uuid());raise exception 'Écriture anonyme';exception when insufficient_privilege then null;end;
 if public.public_profile_resolve('@social-beta') is null then raise exception 'Profil anonyme inaccessible';end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);
do $$ declare result jsonb;begin
 begin perform * from public.social_relationships;raise exception 'Lecture brute';exception when insufficient_privilege then null;end;
 begin insert into public.social_blocks(blocker,blocked) values(auth.uid(),'fe000000-0000-4000-8000-000000000002');raise exception 'Écriture brute';exception when insufficient_privilege then null;end;
 begin perform public.social_account_active(auth.uid());raise exception 'Helper privé';exception when insufficient_privilege then null;end;
 begin perform public.social_change('request',auth.uid(),gen_random_uuid());raise exception 'Auto-demande';exception when raise_exception then if sqlerrm<>'social_invalid' then raise;end if;end;
 result:=public.social_change('request','fe000000-0000-4000-8000-000000000002','fe000000-0000-4000-8000-000000000010');
 if result->>'state'<>'outgoing' then raise exception 'Demande absente';end if;
 if public.social_change('request','fe000000-0000-4000-8000-000000000002','fe000000-0000-4000-8000-000000000010')->>'replayed'<>'true' then raise exception 'Idempotence absente';end if;
 begin perform public.social_change('accept','fe000000-0000-4000-8000-000000000002',gen_random_uuid(),(result->>'relationId')::uuid);raise exception 'Auto-acceptation';exception when raise_exception then if sqlerrm<>'social_conflict' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000003',true);
do $$ begin
 if jsonb_array_length(public.social_list('friends')->'items')<>0 or jsonb_array_length(public.social_list('incoming')->'items')<>0 then raise exception 'Liste d’un tiers exposée à un administrateur';end if;
end $$;
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000002',true);
do $$ declare result jsonb;relation uuid;begin
 result:=public.social_change('request','fe000000-0000-4000-8000-000000000001',gen_random_uuid());
 if result->>'state'<>'incoming' then raise exception 'Demande inverse acceptée implicitement';end if;
 relation:=(result->>'relationId')::uuid;
 if public.social_change('accept','fe000000-0000-4000-8000-000000000001',gen_random_uuid(),relation)->>'state'<>'friends' then raise exception 'Acceptation échouée';end if;
 if jsonb_array_length(public.social_list('friends')->'items')<>1 then raise exception 'Amitié absente';end if;
 perform public.social_change('block','fe000000-0000-4000-8000-000000000001',gen_random_uuid());
 if public.public_profile_resolve('@social-alpha') is not null or public.public_profile_resolve('fe000000-0000-4000-8000-000000000001') is not null then raise exception 'Alias contourne le blocage';end if;
 if public.public_profiles_page('@social-alpha')->>'total'<>'0' then raise exception 'Recherche contourne le blocage';end if;
 if exists(select 1 from public.public_profiles where id='fe000000-0000-4000-8000-000000000001') then raise exception 'Vue contourne le blocage';end if;
 if jsonb_array_length(public.social_list('friends')->'items')<>0 then raise exception 'Amitié conservée';end if;
end $$;
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);
do $$ declare action text;begin
 if public.public_profile_resolve('@social-beta') is not null then raise exception 'Blocage non réciproque';end if;
 foreach action in array array['request','accept'] loop
  begin perform public.social_change(action,'fe000000-0000-4000-8000-000000000002',gen_random_uuid(),gen_random_uuid());raise exception 'Interaction bloquée autorisée';exception when raise_exception then if sqlerrm<>'social_unavailable' then raise;end if;end;
 end loop;
 perform public.social_change('unblock','fe000000-0000-4000-8000-000000000002',gen_random_uuid(),gen_random_uuid());
 if public.public_profile_resolve('@social-beta') is not null then raise exception 'Déblocage usurpé';end if;
end $$;
reset role;
-- Les profils restent publics hors session ; les outils privilégiés gardent leur accès.
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin if public.public_profile_resolve('@social-beta') is null then raise exception 'Consultation anonyme supprimée';end if;end $$;
reset role;
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ declare blocked_id uuid;begin
 blocked_id:=(public.social_list('blocked')->'items'->0->>'id')::uuid;
 perform public.social_change('unblock','fe000000-0000-4000-8000-000000000001',gen_random_uuid(),blocked_id);
 if public.public_profile_resolve('@social-alpha') is null or jsonb_array_length(public.social_list('friends')->'items')<>0 then raise exception 'Déblocage restaure une amitié';end if;
end $$;
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);
do $$ begin
 begin perform public.social_change('request','fe000000-0000-4000-8000-000000000002',gen_random_uuid());raise exception 'Cooldown contourné';exception when raise_exception then if sqlerrm<>'social_rate_limited' then raise;end if;end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000003',true);
select public.social_change('request','fe000000-0000-4000-8000-000000000001',gen_random_uuid());
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);
do $$ declare relation uuid;begin
 relation:=(public.social_list('incoming')->'items'->0->>'id')::uuid;
 perform public.social_change('reject','fe000000-0000-4000-8000-000000000003',gen_random_uuid(),relation);
 if jsonb_array_length(public.social_list('incoming')->'items')<>0 then raise exception 'Refus non appliqué';end if;
end $$;
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000003',true);
do $$ declare relation uuid;begin
 relation:=(public.social_change('request','fe000000-0000-4000-8000-000000000002',gen_random_uuid())->>'relationId')::uuid;
 perform public.social_change('cancel','fe000000-0000-4000-8000-000000000002',gen_random_uuid(),relation);
 if jsonb_array_length(public.social_list('outgoing')->'items')<>0 then raise exception 'Annulation non appliquée';end if;
end $$;
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000002',true);
select public.social_change('request','fe000000-0000-4000-8000-000000000003',gen_random_uuid());
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000003',true);
do $$ declare relation uuid;begin
 relation:=(public.social_list('incoming')->'items'->0->>'id')::uuid;
 perform public.social_change('accept','fe000000-0000-4000-8000-000000000002',gen_random_uuid(),relation);
 perform public.social_change('remove','fe000000-0000-4000-8000-000000000002',gen_random_uuid(),relation);
 if jsonb_array_length(public.social_list('friends')->'items')<>0 then raise exception 'Suppression amitié non appliquée';end if;
end $$;
reset role;

alter table auth.users add column banned_until timestamptz;
alter table auth.users add column deleted_at timestamptz;
update auth.users set banned_until=now()+interval '1 hour' where id='fe000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000003',true);
do $$ begin
 begin perform public.social_change('request','fe000000-0000-4000-8000-000000000001',gen_random_uuid());raise exception 'Compte Auth banni autorisé';exception when raise_exception then if sqlerrm<>'social_inactive' then raise;end if;end;
end $$;
reset role;

update auth.users set banned_until=null,deleted_at=now() where id='fe000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
 begin perform public.social_change('request','fe000000-0000-4000-8000-000000000001',gen_random_uuid());raise exception 'Compte Auth supprimé autorisé';exception when raise_exception then if sqlerrm<>'social_inactive' then raise;end if;end;
end $$;
reset role;

do $$ declare v_target uuid;job uuid;lease uuid;begin
 -- Tous les objets sociaux liés à un profil sont purgés pendant la préparation SQL.
 select id into v_target from public.profiles where username='social-alpha';
 job:=(public.distribution_account_request(v_target,v_target)->>'id')::uuid;
 lease:=(public.distribution_account_claim(job)->>'lease')::uuid;
 perform public.distribution_account_prepare(job,lease);
 if exists(select 1 from public.social_relationships where user_low=v_target or user_high=v_target)
 or exists(select 1 from public.social_blocks where blocker=v_target or blocked=v_target)
 or exists(select 1 from public.social_operations where actor=v_target or target=v_target)
 or exists(select 1 from public.social_request_cooldowns where actor=v_target or target=v_target) then raise exception 'Données sociales orphelines';end if;
end $$;
rollback;
