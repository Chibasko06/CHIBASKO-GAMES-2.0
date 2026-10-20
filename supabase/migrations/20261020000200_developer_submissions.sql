begin;
set local lock_timeout='5s';
create table public.game_developer_registrations (
 actor uuid not null references auth.users(id),request_id uuid not null,game_id uuid not null references public.games(id),
 created_at timestamptz not null default now(),primary key(actor,request_id)
);
alter table public.game_developer_registrations enable row level security;
revoke all on public.game_developer_registrations from public,anon,authenticated;
grant select,insert on public.game_developer_registrations to service_role;
alter table public.game_submissions add column build_upload_id uuid unique references public.game_build_uploads(id);

create function public.distribution_register_game(p_actor uuid,p_request uuid,p_title text) returns uuid
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare game uuid;
begin
 if not exists(select 1 from auth.users where id=p_actor) then raise exception 'unauthorized'; end if;
 if length(btrim(p_title)) not between 1 and 160 or p_title is null or p_request is null then raise exception 'invalid_request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 select game_id into game from public.game_developer_registrations where actor=p_actor and request_id=p_request;
 if found then return game; end if;
 if (select count(*) from public.game_developer_registrations where actor=p_actor and created_at>now()-interval '1 day')>=5 then raise exception 'quota_exceeded'; end if;
 game:=gen_random_uuid();
 -- Existing managed-runtime catalogue type; gameplay capabilities come from the validated manifest.
 insert into public.games(id,title,slug,game_type,multiplayer_game_id,game_url,is_published)
 values(game,btrim(p_title),'game-'||game::text,'multiplayer_chibasko',game::text,null,false);
 insert into public.game_developer_members(game_id,user_id,role) values(game,p_actor,'owner');
 insert into public.game_developer_registrations(actor,request_id,game_id) values(p_actor,p_request,game);
 return game;
end $$;

create function public.distribution_developer_catalog(p_actor uuid,p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from auth.users where id=p_actor) then raise exception 'unauthorized'; end if;
 if p_offset<0 or p_offset>100000 then raise exception 'invalid_request'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'title',x.title) order by x.title,x.id)
 from (select g.id,g.title from public.games g where public.distribution_can_upload(p_actor,g.id) order by g.title,g.id limit 50 offset p_offset) x),'[]');
end $$;

create function public.distribution_submit_editorial(p_actor uuid,p_upload uuid,p_title text,p_description text,p_categories uuid[],p_website text) returns uuid
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; submission uuid; categories text[]; contact text; studio text;
begin
 u:=public.distribution_get_upload(p_actor,p_upload);
 if u.created_by is distinct from p_actor then raise exception 'forbidden'; end if;
 if u.status not in ('queued','validating','completed') then raise exception 'invalid_state'; end if;
 if length(btrim(p_title)) not between 1 and 160 or p_title is null
 or length(btrim(p_description)) not between 1 and 10000 or p_description is null
 or coalesce(cardinality(p_categories),0)>8 or length(coalesce(p_website,''))>2048 then raise exception 'invalid_request'; end if;
 if p_website is not null and p_website<>'' and p_website !~ '^https://[^/@[:space:]]+([/?#]|$)' then raise exception 'invalid_request'; end if;
 select array_agg(name order by name) into categories from public.categories where id=any(p_categories);
 if coalesce(cardinality(categories),0)<>coalesce(cardinality(p_categories),0) then raise exception 'invalid_request'; end if;
 select id into submission from public.game_submissions where build_upload_id=p_upload;
 if found then return submission; end if;
 select email into contact from auth.users where id=p_actor;
 select username into studio from public.profiles where id=p_actor;
 insert into public.game_submissions(build_upload_id,name_or_studio,email,game_title,demo_url,game_type,description,short_description,long_description,category_names,developer_website,ownership_confirmed)
 values(p_upload,coalesce(studio,'Développeur Chibasko Games'),coalesce(contact,''),btrim(p_title),'','web_build',btrim(p_description),left(btrim(p_description),180),btrim(p_description),coalesce(categories,'{}'),nullif(p_website,''),true)
 returning id into submission;
 insert into public.game_build_reviews(upload_id,submission_id) values(p_upload,submission)
 on conflict(upload_id) do update set submission_id=excluded.submission_id,updated_at=now();
 return submission;
end $$;

create function public.distribution_developer_builds(p_actor uuid,p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from auth.users where id=p_actor) then raise exception 'unauthorized'; end if;
 if p_offset<0 or p_offset>100000 then raise exception 'invalid_request'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'gameId',x.game_id,'title',x.title,'version',x.version,'createdAt',x.created_at,
 'technicalStatus',x.status,'versionStatus',x.version_status,'decision',coalesce(x.decision,'pending'),'reason',x.reason,'editorialComplete',x.submission_id is not null) order by x.created_at desc,x.id)
 from (select u.id,u.game_id,g.title,u.version,u.created_at,u.status,v.status version_status,r.decision,r.reason,s.id submission_id
 from public.game_build_uploads u join public.games g on g.id=u.game_id
 left join public.game_versions v on v.id=u.version_id and v.game_id=u.game_id and u.status='completed'
 left join public.game_build_reviews r on r.upload_id=u.id
 left join public.game_submissions s on s.build_upload_id=u.id
 where u.created_by=p_actor and public.distribution_can_upload(p_actor,u.game_id)
 order by u.created_at desc,u.id limit 50 offset p_offset) x),'[]');
end $$;
revoke all on function public.distribution_register_game(uuid,uuid,text),public.distribution_developer_catalog(uuid,integer),
 public.distribution_submit_editorial(uuid,uuid,text,text,uuid[],text),public.distribution_developer_builds(uuid,integer) from public,anon,authenticated;
grant execute on function public.distribution_register_game(uuid,uuid,text),public.distribution_developer_catalog(uuid,integer),
 public.distribution_submit_editorial(uuid,uuid,text,text,uuid[],text),public.distribution_developer_builds(uuid,integer) to service_role;
commit;
