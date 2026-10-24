begin;
create temporary table catalogue_fixture_ids(id uuid primary key);
with inserted as(
 insert into public.games(id,title,slug,game_url,description,developer_name,mobile_compatible,created_at)
 select gen_random_uuid(),'bulk-catalogue-'||lpad(i::text,4,'0'),'bulk-catalogue-'||i,'https://example.test/game','Recherche commune','Studio test',case when i%2=0 then 'Oui' else 'PC uniquement' end,'2026-01-01'::timestamptz from generate_series(1,1205) i returning id)
 insert into catalogue_fixture_ids select id from inserted;
do $$
declare category uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); game uuid; v uuid; result jsonb; ids uuid[]:='{}'; page_ids uuid[]; n integer; private_game uuid;
begin
 insert into public.categories(id,name,slug) values(category,'Catégorie volumineuse','bulk-category');
 insert into public.game_categories(game_id,category_id) select id,category from catalogue_fixture_ids;
 insert into auth.users(id,email) values(actor,'bulk-fixture@example.test');
 insert into public.favorites(user_id,game_id) select actor,id from catalogue_fixture_ids;
 select id into game from public.games where slug='bulk-catalogue-1205';
 insert into public.game_reactions(user_id,game_id,reaction) values(actor,game,'like');
 insert into public.game_reviews(user_id,game_id,rating,comment) values(actor,game,5,'Avis au-delà de mille jeux');
 for n in 0..12 loop
  result:=public.catalogue_page(p_search=>'bulk-catalogue-',p_sort=>'recent',p_offset=>n*100,p_limit=>100);
  if (result->>'total')::integer<>1205 then raise exception 'Catalogue tronqué'; end if;
  select array_agg((item->>'id')::uuid) into page_ids from jsonb_array_elements(result->'items') item;
  ids:=ids||page_ids;
 end loop;
 if cardinality(ids)<>1205 or (select count(distinct id) from unnest(ids) id)<>1205 then raise exception 'Omission ou doublon entre pages'; end if;
 result:=public.catalogue_page(p_search=>'bulk-catalogue-',p_category=>'bulk-category',p_device=>'mobile',p_sort=>'title-desc');
 if (result->>'total')::integer<>602 or result->'items'->0->>'title'<>'bulk-catalogue-1204' then raise exception 'Filtres ou tri incorrects'; end if;
 result:=public.catalogue_page(p_slug=>'bulk-catalogue-1205',p_limit=>1);
 if result->'items'->0->>'likes_count'<>'1' or result->'items'->0->>'favorites_count'<>'1' or result->'items'->0->>'average_rating'<>'5.00' then raise exception 'Statistiques tronquées'; end if;
 if public.catalogue_page(p_search=>'bulk-catalogue-1205')->>'total'<>'1' then raise exception 'Recherche partielle incorrecte'; end if;
 if public.catalogue_page(p_search=>'bulk-catalogue-%')->>'total'<>'0' then raise exception 'Recherche interprétée comme un motif'; end if;
 insert into public.games(title,slug,game_url,description) values('Zèbre','accent-fixture-z','https://example.test','accent-fixture'),('Éclair','accent-fixture-e','https://example.test','accent-fixture');
 if public.catalogue_page(p_search=>'accent-fixture',p_sort=>'title-asc')->'items'->0->>'title'<>'Éclair' then raise exception 'Tri des accents incorrect'; end if;
 private_game:=public.distribution_register_game(actor,gen_random_uuid(),'Jeu SDK privé');
 if public.catalogue_page(p_slug=>(select slug from public.games where id=private_game))->>'total'<>'0' then raise exception 'Brouillon exposé'; end if;
 insert into public.game_versions(game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count)
 values(private_game,'1.0.0',1,1,jsonb_build_object('gameId',private_game,'version','1.0.0','schemaVersion',1,'integrationVersion',1,'capabilities',jsonb_build_object('local',jsonb_build_object('players',jsonb_build_object('min',1,'max',2)))),repeat('a',64),100,1) returning id into v;
 update public.game_versions set status='in_review' where id=v; update public.game_versions set status='approved' where id=v; update public.game_versions set status='published' where id=v;
 perform public.set_active_game_version(private_game,v);update public.games set is_published=true where id=private_game;
 result:=public.catalogue_page(p_slug=>(select slug from public.games where id=private_game));
 if result->'items'->0->'runtime_capabilities'->'local' is null then raise exception 'Capacité SDK absente'; end if;
 if (result->'items'->0)?'manifest' or (result->'items'->0)?'created_by' then raise exception 'Donnée interne projetée'; end if;
 begin perform public.catalogue_page(p_limit=>101);raise exception 'Limite non validée';exception when invalid_parameter_value then null;end;
 if public.catalogue_device('Non compatible mobile')<> 'unknown' then raise exception 'Compatibilité différente du filtre historique'; end if;
 begin perform public.catalogue_admin_users(actor);raise exception 'Compte ordinaire autorisé';exception when insufficient_privilege then null;end;
 if has_function_privilege('anon','public.catalogue_admin_users(uuid,integer,integer)','execute') or has_function_privilege('authenticated','public.catalogue_admin_users(uuid,integer,integer)','execute') then raise exception 'Coordonnées admin accessibles publiquement'; end if;
 insert into public.admin_users(user_id) values(actor);
 result:=public.catalogue_admin_users(actor);
 if jsonb_array_length(result->'users')>50 or result::text not like '%bulk-fixture@example.test%' then raise exception 'Page admin incorrecte'; end if;
 insert into public.play_history(user_id,game_id,played_at) select actor,game,now()-i*interval '1 second' from generate_series(1,250) i;
 insert into public.play_history(user_id,game_id,played_at) select actor,id,now()-interval '1 day' from public.games where slug in('bulk-catalogue-1','bulk-catalogue-2','bulk-catalogue-3','bulk-catalogue-4');
 perform set_config('chibasko.fixture_actor',actor::text,true);
 perform set_config('request.jwt.claim.sub',actor::text,true);
end $$;
set local role authenticated;
do $$ begin
 if jsonb_array_length(public.catalogue_recent_history(current_setting('chibasko.fixture_actor')::uuid,5))<>5 then raise exception 'Historique tronqué par les répétitions'; end if;
 begin perform public.catalogue_recent_history(gen_random_uuid(),5);raise exception 'Historique tiers accessible';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
select public.catalogue_page(p_search=>'bulk-catalogue-',p_limit=>1)->>'total' as public_total;
reset role;
analyze public.favorites;
explain(analyze,buffers) select count(*) from public.favorites where game_id=(select id from public.games where slug='bulk-catalogue-1205');
select pg_column_size(jsonb_agg(to_jsonb(g))) as catalogue_complet_octets from public.games g where g.slug like 'bulk-catalogue-%';
select pg_column_size(public.catalogue_page(p_search=>'bulk-catalogue-',p_limit=>24)) as page_24_octets;
rollback;
