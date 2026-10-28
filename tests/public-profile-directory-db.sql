begin;

insert into auth.users(id,email)
select ('f1000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
       'directory-'||i||'@example.test'
from generate_series(1,1205) i;
insert into public.profiles(id,username,bio)
select id,'directory-'||lpad(i::text,4,'0'),'Biographie publique'
from generate_series(1,1205) i
join auth.users on id=('f1000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid
on conflict(id) do update set username=excluded.username,bio=excluded.bio;

insert into public.admin_users(user_id) values
 ('f1000000-0000-4000-8000-000000000001'),
 ('f1000000-0000-4000-8000-000000000003');
select public.distribution_register_game('f1000000-0000-4000-8000-000000000002',gen_random_uuid(),'Jeu de la communauté');
insert into public.game_developer_members(game_id,user_id,role)
select game_id,'f1000000-0000-4000-8000-000000000003','editor'
from public.game_developer_members where user_id='f1000000-0000-4000-8000-000000000002';
update public.profiles set bio='ADMIN DÉVELOPPEUR' where id='f1000000-0000-4000-8000-000000000004';

set local role anon;
do $$
declare result jsonb; ids uuid[]:='{}'; batch uuid[]; n integer; item jsonb;
begin
 for n in 1..51 loop
  result:=public.public_profiles_page('directory-',n);
  if result->>'total'<>'1205' or jsonb_array_length(result->'items')>24 then raise exception 'Pagination tronquée'; end if;
  select array_agg((x->>'id')::uuid order by x->>'username',x->>'id') into batch from jsonb_array_elements(result->'items') x;
  ids:=ids||batch;
 end loop;
 if cardinality(ids)<>1205 or (select count(distinct x) from unnest(ids) x)<>1205 then raise exception 'Omission ou doublon'; end if;
 if ids[1]<>'f1000000-0000-4000-8000-000000000001' or ids[1205]<>'f1000000-0000-4000-8000-000000001205' then raise exception 'Tri instable'; end if;
 result:=public.public_profiles_page('directory-',1,'admin');
 if result->>'total'<>'2' then raise exception 'Filtre administrateur incorrect'; end if;
 result:=public.public_profiles_page('DIRECTORY-',1,'developer');
 if result->>'total'<>'2' then raise exception 'Filtre développeur incorrect'; end if;
 foreach n in array array[1,2,3,4] loop
  item:=public.public_profiles_page('',1,'all',('f1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid)->'items'->0;
  if (item->'roles'->>'admin')::boolean<>(n in (1,3)) or (item->'roles'->>'developer')::boolean<>(n in (2,3)) then raise exception 'Badge attribué à tort'; end if;
  if (select count(*) from jsonb_object_keys(item))<>6 or item ?| array['email','contact_email','first_name','last_name','display_name','xp_points'] then raise exception 'Donnée privée projetée'; end if;
 end loop;
 if public.public_profiles_page('directory-%')->>'total'<>'0' then raise exception 'Motif de recherche interprété'; end if;
 begin
  perform public.public_profiles_page('',0);raise exception 'Page invalide acceptée';
 exception when raise_exception then if sqlerrm<>'invalid_request' then raise;end if;end;
 begin
  perform public.public_profiles_page('',1,'owner');raise exception 'Rôle invalide accepté';
 exception when raise_exception then if sqlerrm<>'invalid_request' then raise;end if;end;
 begin
  insert into public.admin_users(user_id) values('f1000000-0000-4000-8000-000000000004');
  raise exception 'Écriture de rôle autorisée';
 exception when insufficient_privilege then null;end;
 begin
  perform user_id from public.game_developer_members;
  raise exception 'Table privée accessible';
 exception when insufficient_privilege then null;end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000004',true);
update public.profiles set username='admin-studio',bio='DÉVELOPPEUR' where id=auth.uid();
do $$
begin
 if public.public_profiles_page('',1,'all',auth.uid())->'items'->0->'roles'<>'{"admin":false,"developer":false}'::jsonb then raise exception 'Profil éditable utilisé comme rôle';end if;
 begin
  insert into public.admin_users(user_id) values(auth.uid());
  raise exception 'Auto-attribution ADMIN autorisée';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.game_developer_members(game_id,user_id,role) values(gen_random_uuid(),auth.uid(),'owner');
  raise exception 'Auto-attribution développeur autorisée';
 exception when insufficient_privilege then null;end;
end $$;
reset role;

delete from public.admin_users where user_id='f1000000-0000-4000-8000-000000000003';
delete from public.game_developer_members where user_id='f1000000-0000-4000-8000-000000000003';
do $$
begin
 if public.public_profiles_page('',1,'all','f1000000-0000-4000-8000-000000000003')->'items'->0->'roles'<>'{"admin":false,"developer":false}'::jsonb then raise exception 'Révocation non prise en compte';end if;
 if not has_function_privilege('anon','public.public_profiles_page(text,integer,text,uuid)','execute') then raise exception 'Projection publique inaccessible';end if;
 if not exists(select 1 from pg_proc where oid='public.public_profiles_page(text,integer,text,uuid)'::regprocedure and prosecdef and proconfig @> array['search_path=""']) then raise exception 'search_path non isolé';end if;
end $$;
rollback;
