\set ON_ERROR_STOP on
reset role;
alter table public.games add column description text,add column developer_name text,add column release_date_text text,
 add column mobile_compatible text,add column technology text,add column thumbnail_url text,add column provider_name text;
create table public.game_categories(game_id uuid references public.games(id),category_id uuid references public.categories(id),primary key(game_id,category_id));
grant select,insert,delete on public.game_categories to service_role;
insert into public.categories values('54545454-5454-4454-8454-545454545454','Fixture category');
insert into auth.users(id,email) values('23232323-2323-4323-8323-232323232323','catalogue-fixture@example.test');
update public.games set provider_name='GameMonetize' where id='11111111-1111-4111-8111-111111111111';
\ir ../supabase/migrations/20261020000300_submission_catalogue.sql
set role service_role;
do $$ declare actor uuid:='23232323-2323-4323-8323-232323232323'; game uuid; u public.game_build_uploads; sid uuid; result jsonb;
 metadata jsonb:='{"title":"Developer fixture","studio":"Studio fixture","releaseDate":"2026-10-20","description":"Editorial description","categories":["54545454-5454-4454-8454-545454545454"],"mobile":true,"technology":"Godot Web","website":""}';
 cover text:='https://assets.chibaskogames.fr/game-thumbnails/54545454-5454-4454-8454-545454545454.png';
begin
 if jsonb_array_length(public.distribution_managed_catalog(actor))<>0 then raise exception 'New developer sees catalogue'; end if;
 game:=public.distribution_register_game(actor,gen_random_uuid(),'Private reserved title');
 if jsonb_array_length(public.distribution_managed_catalog(actor))<>0 then raise exception 'Unsubmitted registration appears as update'; end if;
 if exists(select 1 from jsonb_array_elements(public.distribution_managed_catalog('dddddddd-dddd-4ddd-8ddd-dddddddddddd')) x where x->>'id'=game::text) then raise exception 'Admin sees unowned game in managed picker'; end if;
 if not public.distribution_can_upload('dddddddd-dddd-4ddd-8ddd-dddddddddddd',game) then raise exception 'Admin backend authorization changed'; end if;
 u:=public.distribution_create_upload(actor,game,'1.0.0',100,gen_random_uuid(),public.upload_test_policy());
 perform public.distribution_attach_transport(actor,u.id,'fixture-transport');
 perform public.distribution_begin_finalize(actor,u.id);
 perform public.distribution_enqueue_upload(actor,u.id,'fixture-etag');
 perform public.distribution_expect_failure(format('select public.distribution_submit_catalogue(%L,%L,''new'',%L,null)',actor,u.id,metadata));
 perform public.distribution_expect_failure(format('select public.distribution_submit_catalogue(%L,%L,''update'',''{}'',null)',actor,u.id));
 perform public.distribution_expect_failure(format('select public.distribution_submit_catalogue(%L,%L,''new'',%L,%L)','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',u.id,metadata,cover));
 sid:=public.distribution_submit_catalogue(actor,u.id,'new',metadata,cover);
 if sid<>public.distribution_submit_catalogue(actor,u.id,'new',metadata,cover) then raise exception 'Non-idempotent editorial submission'; end if;
 if not exists(select 1 from public.game_submissions where id=sid and submission_kind='new' and name_or_studio='Studio fixture' and release_date='2026-10-20' and mobile_compatibility='Oui' and technology='Godot Web' and cover_image_url=cover) then raise exception 'Missing metadata'; end if;
 if not exists(select 1 from public.games where id=game and title='Private reserved title' and not is_published and active_version_id is null) then raise exception 'Premature catalogue publication'; end if;
 if exists(select 1 from public.game_versions where game_id=game) then raise exception 'Premature game_version'; end if;
 result:=public.distribution_admin_builds('dddddddd-dddd-4ddd-8ddd-dddddddddddd',u.id);
 if result->'submission'->>'technology'<>'Godot Web' then raise exception 'Admin projection lost metadata'; end if;
 insert into public.game_versions(id,game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count,created_by)
 values(u.version_id,game,'1.0.0',1,1,jsonb_build_object('schemaVersion',1,'integrationVersion',1,'gameId',game,'version','1.0.0','capabilities','{"local":{"players":{"min":1,"max":1}}}'::jsonb,'client','{"entrypoints":{"local":"index.html"}}'::jsonb),repeat('a',64),100,2,actor);
 update public.game_build_uploads set status='completed' where id=u.id;
 perform public.distribution_review_action('dddddddd-dddd-4ddd-8ddd-dddddddddddd',u.id,'review','{"tested":true,"content":true,"metadata":true,"behavior":true}');
 perform public.distribution_review_action('dddddddd-dddd-4ddd-8ddd-dddddddddddd',u.id,'publish');
 if jsonb_array_length(public.distribution_managed_catalog(actor))<>1 then raise exception 'Published managed game missing'; end if;
 if not exists(select 1 from public.games where id=game and title='Developer fixture' and developer_name='Studio fixture' and technology='Godot Web' and thumbnail_url=cover and active_version_id=u.version_id and catalogue_source='developer_submission' and provider_name is null and not is_published) then raise exception 'Reviewed catalogue not applied'; end if;
 if not exists(select 1 from public.game_categories where game_id=game and category_id='54545454-5454-4454-8454-545454545454') then raise exception 'Missing categories'; end if;
 perform public.distribution_review_action('dddddddd-dddd-4ddd-8ddd-dddddddddddd',u.id,'publish');
 u:=public.distribution_create_upload(actor,game,'1.1.0',100,gen_random_uuid(),public.upload_test_policy());
 perform public.distribution_attach_transport(actor,u.id,'fixture-update');perform public.distribution_begin_finalize(actor,u.id);perform public.distribution_enqueue_upload(actor,u.id,'fixture-etag');
 perform public.distribution_expect_failure(format('select public.distribution_submit_catalogue(%L,%L,''update'',%L,null)',actor,u.id,metadata));
 sid:=public.distribution_submit_catalogue(actor,u.id,'update','{}');
 if (select submission_kind from public.game_submissions where id=sid)<>'update' then raise exception 'Missing update submission'; end if;
 insert into public.game_versions(id,game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count,created_by)
 select u.version_id,game,'1.1.0',1,1,jsonb_set(manifest,'{version}','"1.1.0"'),repeat('b',64),100,2,actor
 from public.game_versions where game_id=game and version='1.0.0';
 update public.game_build_uploads set status='completed' where id=u.id;
 perform public.distribution_review_action('dddddddd-dddd-4ddd-8ddd-dddddddddddd',u.id,'review','{"tested":true,"content":true,"metadata":true,"behavior":true}');
 perform public.distribution_review_action('dddddddd-dddd-4ddd-8ddd-dddddddddddd',u.id,'publish');
 if not exists(select 1 from public.games where id=game and title='Developer fixture' and technology='Godot Web' and thumbnail_url=cover and active_version_id=u.version_id) then raise exception 'Build update overwrote editorial metadata'; end if;
 if not exists(select 1 from public.games where id='11111111-1111-4111-8111-111111111111' and provider_name='GameMonetize' and catalogue_source is null) then raise exception 'Legacy source changed'; end if;
end $$;
set role anon;
select public.distribution_expect_failure('select public.distribution_managed_catalog(gen_random_uuid())');
select public.distribution_expect_failure('select public.distribution_submit_catalogue(gen_random_uuid(),gen_random_uuid(),''new'',''{}'')');
do $$ begin
 if exists(select 1 from public.games where title='Developer fixture') then raise exception 'Private gameId publicly visible'; end if;
end $$;
reset role;
