begin;
insert into auth.users(id,email)
select ('fb000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'console-'||i||'@example.test' from generate_series(1,1205) i;
update public.profiles set username='console-member-'||right(id::text,12) where id::text like 'fb000000-%';
insert into public.admin_users(user_id) values('fb000000-0000-4000-8000-000000000001'),('fb000000-0000-4000-8000-000000000004');
select public.distribution_register_game('fb000000-0000-4000-8000-000000000003',gen_random_uuid(),'Jeu console');
insert into public.game_developer_members(game_id,user_id,role) select game_id,'fb000000-0000-4000-8000-000000000004','editor' from public.game_developer_members where user_id='fb000000-0000-4000-8000-000000000003';
select public.distribution_account_request('fb000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000002');
update public.game_account_deletions set state='review_required' where target_user_id='fb000000-0000-4000-8000-000000000002';
do $$
declare game uuid; version uuid:=gen_random_uuid(); upload uuid:=gen_random_uuid(); before_count integer;
begin
 select game_id into game from public.game_developer_members where user_id='fb000000-0000-4000-8000-000000000003';
 before_count:=(public.admin_console_overview('fb000000-0000-4000-8000-000000000001')->>'buildsAwaitingReview')::integer;
 insert into public.game_versions(id,game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count)
 values(version,game,'1.0.0',1,1,jsonb_build_object('gameId',game,'version','1.0.0','schemaVersion',1,'integrationVersion',1,'capabilities',jsonb_build_object('local',jsonb_build_object('players',jsonb_build_object('min',1,'max',2)))),repeat('a',64),100,1);
 insert into public.game_build_uploads(id,game_id,created_by,request_id,version,version_id,status,expected_size,policy,expires_at)
 values(upload,game,'fb000000-0000-4000-8000-000000000003',gen_random_uuid(),'1.0.0',version,'completed',100,'{"revision":"1"}',now()+interval '1 day');
 if (public.admin_console_overview('fb000000-0000-4000-8000-000000000001')->>'buildsAwaitingReview')::integer<>before_count then raise exception 'Brouillon compté comme soumission';end if;
 insert into public.developer_contacts(user_id,first_name,last_name,contact_email,public_name) values('fb000000-0000-4000-8000-000000000003','Test','Console','console-contact@example.test','Studio');
 insert into public.game_submissions(name_or_studio,email,game_title,demo_url,game_type,description,build_upload_id)
 values('Studio','console-contact@example.test','Jeu console','https://example.test','web','Description',upload);
 if (public.admin_console_overview('fb000000-0000-4000-8000-000000000001')->>'buildsAwaitingReview')::integer<>before_count+1 then raise exception 'Soumission réelle non comptée';end if;
end $$;
do $$
declare name text;
begin
 foreach name in array array['admin_console_users(uuid,text,text,integer,integer)','admin_console_overview(uuid)','admin_console_deletions(uuid,text,integer,integer)'] loop
  if has_function_privilege('anon','public.'||name,'execute') or has_function_privilege('authenticated','public.'||name,'execute') then raise exception 'Accès direct à une RPC administrative';end if;
  if not exists(select 1 from pg_proc where oid=('public.'||name)::regprocedure and prosecdef and proconfig @> array['search_path=""']) then raise exception 'Fonction privilégiée non isolée';end if;
 end loop;
end $$;
set local role service_role;
do $$
declare actor uuid:='fb000000-0000-4000-8000-000000000001'; other uuid:='fb000000-0000-4000-8000-000000000002'; result jsonb; ids uuid[]:='{}'; batch uuid[]; n integer; job uuid;
begin
 for n in 0..24 loop
  result:=public.admin_console_users(actor,'console-member-','all',n*50,50);
  if result->>'total'<>'1205' then raise exception 'Comptage administratif tronqué';end if;
  select array_agg((x->>'id')::uuid) into batch from jsonb_array_elements(result->'users') x;
  ids:=ids||batch;
 end loop;
 if cardinality(ids)<>1205 or (select count(distinct id) from unnest(ids) id)<>1205 then raise exception 'Pagination administrative incomplète';end if;
 if public.admin_console_users(actor,'console-member-','admin')->>'total'<>'2' then raise exception 'Filtre admin incorrect';end if;
 result:=public.admin_console_users(actor,'console-member-','developer');
 if result->>'total'<>'2' then raise exception 'Filtre développeur incorrect';end if;
 if not exists(select 1 from jsonb_array_elements(result->'users') x where x->'roles'='{"admin":true,"developer":true}'::jsonb) then raise exception 'Double badge absent';end if;
 if public.admin_console_users(actor,'console-member-%')->>'total'<>'0' then raise exception 'Recherche interprétée comme motif';end if;
 begin perform public.admin_console_users(other);raise exception 'Accès non administrateur accepté';exception when insufficient_privilege then null;end;
 begin perform public.admin_console_overview(other);raise exception 'Compteurs accessibles sans rôle';exception when insufficient_privilege then null;end;
 begin perform public.admin_console_deletions(other);raise exception 'Suppressions accessibles sans rôle';exception when insufficient_privilege then null;end;
 result:=public.admin_console_overview(actor);
 if (result->>'users')::integer<>(select count(*) from public.profiles) or (result->>'publishedGames')::integer<>(select count(*) from public.games where is_published) then raise exception 'Compteurs inventés ou tronqués';end if;
 job:=(public.distribution_account_request(actor,other)->>'id')::uuid;
 result:=public.admin_console_deletions(actor,'review_required');
 if not exists(select 1 from jsonb_array_elements(result->'deletions') x where x->>'id'=job::text) then raise exception 'Demande à vérifier absente';end if;
 if result::text like '%console-%@example.test%' then raise exception 'Coordonnées exposées dans le suivi technique';end if;
 if (public.admin_console_overview(actor)->>'deletionsAwaitingReview')::integer<1 then raise exception 'Alerte de revue absente';end if;
end $$;
reset role;
rollback;
