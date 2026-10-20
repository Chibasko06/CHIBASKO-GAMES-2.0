begin;
set local lock_timeout='5s';

alter table public.game_submissions
 add column submission_kind text check(submission_kind in ('new','update')),
 add column release_date date,
 add column technology text check(length(technology)<=120),
 add column cover_image_url text,
 add column category_ids uuid[];
alter table public.games add column catalogue_source text check(catalogue_source in ('developer_submission'));

-- Only registered developer submissions acquire this provenance; imported games retain theirs.
update public.games g set catalogue_source='developer_submission'
where exists(select 1 from public.game_developer_registrations r where r.game_id=g.id);

create function public.distribution_managed_catalog(p_actor uuid,p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
begin
 if p_actor is null then raise exception 'unauthorized'; end if;
 if p_offset<0 or p_offset>100000 then raise exception 'invalid_request'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'title',x.title) order by x.title,x.id)
 from (select g.id,g.title from public.games g
 where exists(select 1 from public.game_developer_members m where m.game_id=g.id and m.user_id=p_actor)
 and (not exists(select 1 from public.game_developer_registrations r where r.game_id=g.id)
   or exists(select 1 from public.game_versions v where v.game_id=g.id and v.status='published'))
 order by g.title,g.id limit 50 offset p_offset) x),'[]');
end $$;

create function public.distribution_editorial_context(p_actor uuid,p_upload uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads;
begin
 u:=public.distribution_get_upload(p_actor,p_upload);
 if u.created_by is distinct from p_actor then raise exception 'forbidden'; end if;
 if u.status not in ('queued','validating','completed') then raise exception 'invalid_state'; end if;
 return jsonb_build_object('submissionId',(select id from public.game_submissions where build_upload_id=u.id),
   'gameId',u.game_id,'version',u.version,'kind',coalesce((select submission_kind from public.game_submissions where build_upload_id=u.id),
   case when exists(select 1 from public.game_developer_registrations r join public.games g on g.id=r.game_id
     where r.game_id=u.game_id and r.actor=p_actor and not g.is_published)
     and not exists(select 1 from public.game_versions where game_id=u.game_id and status='published') then 'new' else 'update' end));
end $$;

create function public.distribution_submit_catalogue(p_actor uuid,p_upload uuid,p_kind text,p_metadata jsonb,p_cover text default null) returns uuid
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; g public.games; sid uuid; ids uuid[]; released date;
begin
 perform public.distribution_editorial_context(p_actor,p_upload);
 u:=public.distribution_get_upload(p_actor,p_upload);
 select * into g from public.games where id=u.game_id;
 if p_kind is null or p_kind not in ('new','update') or jsonb_typeof(p_metadata) is distinct from 'object' then raise exception 'invalid_request'; end if;
 if p_kind='new' then
   if not exists(select 1 from public.game_developer_registrations where game_id=u.game_id and actor=p_actor)
     or g.is_published then raise exception 'forbidden'; end if;
   if (p_metadata - array['title','studio','releaseDate','description','categories','mobile','technology','website'])<>'{}'::jsonb
     or jsonb_typeof(p_metadata->'mobile') is distinct from 'boolean'
     or jsonb_typeof(p_metadata->'categories') is distinct from 'array'
     or jsonb_array_length(p_metadata->'categories') not between 1 and 8
     or length(btrim(coalesce(p_metadata->>'studio',''))) not between 1 and 160
     or length(btrim(coalesce(p_metadata->>'technology',''))) not between 1 and 120
     or coalesce(p_metadata->>'releaseDate','') !~ '^\d{4}-\d{2}-\d{2}$'
     or p_cover is null or p_cover !~ '^https://assets\.chibaskogames\.fr/game-thumbnails/[0-9a-f-]{36}\.(jpg|png|webp|gif|avif|svg)$'
   then raise exception 'invalid_request'; end if;
   begin released:=(p_metadata->>'releaseDate')::date;
     select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_metadata->'categories');
   exception when others then raise exception 'invalid_request'; end;
   sid:=public.distribution_submit_editorial(p_actor,p_upload,p_metadata->>'title',p_metadata->>'description',ids,p_metadata->>'website');
   -- The existing editorial RPC serializes submission retries through the upload lock.
   if (select submission_kind from public.game_submissions where id=sid) is null then
     update public.game_submissions set submission_kind='new',name_or_studio=btrim(p_metadata->>'studio'),
       release_date=released,technology=btrim(p_metadata->>'technology'),cover_image_url=p_cover,category_ids=ids,
       mobile_compatibility=case when (p_metadata->>'mobile')::boolean then 'Oui' else 'Non' end where id=sid;
   end if;
 else
   if p_metadata<>'{}'::jsonb or p_cover is not null then raise exception 'invalid_request'; end if;
   if exists(select 1 from public.game_developer_registrations where game_id=g.id)
     and not exists(select 1 from public.game_versions where game_id=g.id and status='published') then raise exception 'invalid_state'; end if;
   sid:=public.distribution_submit_editorial(p_actor,p_upload,g.title,coalesce(nullif(g.description,''),'Nouvelle version du jeu.'),'{}',null);
   update public.game_submissions set submission_kind='update' where id=sid and submission_kind is null;
 end if;
 return sid;
end $$;

create function public.distribution_apply_reviewed_catalogue() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.game_submissions; game uuid;
begin
 if new.decision='published' and old.decision is distinct from 'published' then
   select * into s from public.game_submissions where id=new.submission_id;
   if s.submission_kind='new' then
     if s.cover_image_url is null or s.release_date is null or s.technology is null then raise exception 'invalid_state'; end if;
     select game_id into game from public.game_build_uploads where id=new.upload_id and status='completed';
     if game is null or s.build_upload_id is distinct from new.upload_id then raise exception 'invalid_state'; end if;
     update public.games set title=s.game_title,description=s.description,developer_name=s.name_or_studio,
       release_date_text=s.release_date::text,mobile_compatible=s.mobile_compatibility,technology=s.technology,
       thumbnail_url=s.cover_image_url,catalogue_source='developer_submission',provider_name=null where id=game;
     delete from public.game_categories where game_id=game;
     insert into public.game_categories(game_id,category_id) select game,unnest(s.category_ids);
   end if;
 end if;
 return new;
end $$;
create trigger apply_reviewed_catalogue after update of decision on public.game_build_reviews
for each row execute function public.distribution_apply_reviewed_catalogue();

create or replace function public.distribution_review_snapshot(p_id uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',u.id,'gameId',u.game_id,'game',g.title,
 'developer',coalesce(p.username,to_jsonb(g)->>'developer_name',''),'description',to_jsonb(g)->>'description',
 'version',u.version,'createdAt',u.created_at,'updatedAt',u.updated_at,'archiveSize',u.expected_size,
 'technicalStatus',u.status,'errorCode',case when u.error_code in
 ('validation_failed','validation_timeout','storage_error','database_error','service_unavailable','version_conflict','forbidden','upload_expired','review_rejected') then u.error_code when u.error_code is not null then 'validation_failed' end,
 'attempts',u.attempts,'gameVersionId',v.id,'versionStatus',v.status,'manifest',v.manifest,
 'validatedAt',v.validated_at,'publishedAt',v.published_at,'active',g.active_version_id=v.id,
 'review',jsonb_build_object('decision',coalesce(r.decision,'pending'),'checklist',coalesce(r.checklist,'{}'),
 'reviewedAt',r.reviewed_at,'reason',r.reason,'submissionId',r.submission_id),
 'submission',case when s.id is not null then jsonb_build_object('id',s.id,'title',s.game_title,'developer',s.name_or_studio,'description',s.description,'status',s.status,'kind',s.submission_kind,'releaseDate',s.release_date,'technology',s.technology,'mobile',s.mobile_compatibility,'cover',s.cover_image_url,'categories',s.category_names) end,
 'history',coalesce((select jsonb_agg(jsonb_build_object('action',e.action,'at',e.created_at) order by e.id)
 from public.game_build_review_events e where e.upload_id=u.id),'[]'))
 from public.game_build_uploads u join public.games g on g.id=u.game_id
 left join public.profiles p on p.id=u.created_by
 left join public.game_versions v on v.id=u.version_id and v.game_id=u.game_id and v.version=u.version and u.status='completed'
 left join public.game_build_reviews r on r.upload_id=u.id
 left join public.game_submissions s on s.id=r.submission_id where u.id=p_id
$$;


revoke all on function public.distribution_managed_catalog(uuid,integer),public.distribution_editorial_context(uuid,uuid),
 public.distribution_submit_catalogue(uuid,uuid,text,jsonb,text),public.distribution_apply_reviewed_catalogue() from public,anon,authenticated;
grant execute on function public.distribution_managed_catalog(uuid,integer),public.distribution_editorial_context(uuid,uuid),
 public.distribution_submit_catalogue(uuid,uuid,text,jsonb,text),public.distribution_apply_reviewed_catalogue() to service_role;
commit;
