begin;
set local lock_timeout='5s';

create table public.game_submission_drafts (
 game_id uuid primary key references public.games(id),
 created_by uuid not null references auth.users(id),
 metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=65536),
 version text not null default '' check(length(version)<=64),
 revision bigint not null default 0 check(revision>=0),
 upload_id uuid references public.game_build_uploads(id),
 request_id uuid not null default gen_random_uuid(),
 file_info jsonb,
 part_hashes jsonb not null default '{}' check(jsonb_typeof(part_hashes)='object' and octet_length(part_hashes::text)<=65536),
 updated_at timestamptz not null default now()
);
create index game_submission_drafts_owner on public.game_submission_drafts(created_by,updated_at desc,game_id);
alter table public.game_submission_drafts enable row level security;
revoke all on public.game_submission_drafts from public,anon,authenticated;
grant select,insert,update on public.game_submission_drafts to service_role;

-- Recover existing registrations and only metadata already durably stored by the submission flow.
insert into public.game_submission_drafts(game_id,created_by,metadata,version,upload_id,request_id)
select g.id,r.actor,jsonb_build_object('title',coalesce(s.game_title,g.title),'studio',coalesce(s.name_or_studio,''),
 'releaseDate',coalesce(s.release_date::text,''),'description',coalesce(s.description,''),
 'categories',coalesce(to_jsonb(s.category_ids),'[]'),'mobile',case when s.mobile_compatibility='Oui' then true when s.mobile_compatibility='Non' then false end,
 'technology',coalesce(s.technology,'')),coalesce(u.version,''),u.id,coalesce(u.request_id,gen_random_uuid())
from public.games g join public.game_developer_registrations r on r.game_id=g.id
join public.game_developer_members m on m.game_id=g.id and m.user_id=r.actor
left join lateral(select * from public.game_build_uploads where game_id=g.id and created_by=r.actor order by created_at desc,id desc limit 1) u on true
left join public.game_submissions s on s.build_upload_id=u.id
where not g.is_published and not exists(select 1 from public.game_versions v where v.game_id=g.id and v.status='published')
on conflict(game_id) do nothing;

create function public.distribution_initialize_draft() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 insert into public.game_submission_drafts(game_id,created_by,metadata)
 select new.game_id,new.actor,jsonb_build_object('title',title,'studio','','releaseDate','','description','','categories','[]'::jsonb,'mobile',null,'technology','')
 from public.games where id=new.game_id on conflict(game_id) do nothing;
 return new;
end $$;
create trigger initialize_submission_draft after insert on public.game_developer_registrations
for each row execute function public.distribution_initialize_draft();

create function public.distribution_link_draft_upload() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.game_submission_drafts set upload_id=new.id,version=new.version,
 file_info=case when request_id=new.request_id then file_info end,
 part_hashes=case when request_id=new.request_id then part_hashes else '{}'::jsonb end,
 request_id=new.request_id,updated_at=now() where game_id=new.game_id and created_by=new.created_by;
 return new;
end $$;
create trigger link_submission_draft_upload after insert on public.game_build_uploads
for each row execute function public.distribution_link_draft_upload();

create function public.distribution_owned_draft(p_actor uuid,p_game uuid) returns public.game_submission_drafts
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.game_submission_drafts;
begin
 select d0.* into d from public.game_submission_drafts d0 join public.games g on g.id=d0.game_id
 where d0.game_id=p_game and d0.created_by=p_actor and not g.is_published
 and exists(select 1 from public.game_developer_members m where m.game_id=g.id and m.user_id=p_actor)
 and not exists(select 1 from public.game_versions v where v.game_id=g.id and v.status='published');
 if not found then raise exception 'draft_not_found'; end if;
 return d;
end $$;

create function public.distribution_draft_snapshot(p_game uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('gameId',d.game_id,'title',coalesce(nullif(d.metadata->>'title',''),g.title),
 'metadata',d.metadata,'version',d.version,'revision',d.revision,'updatedAt',d.updated_at,
 'requestId',d.request_id,'file',d.file_info,'hashes',d.part_hashes,'submitted',s.id is not null,
 'coverUrl',s.cover_image_url,
 'state',case when s.id is not null then 'submitted' when u.status in ('failed','expired') then 'upload_failed' when u.id is not null then 'uploading' else 'draft' end,
 'upload',case when u.id is not null then jsonb_build_object('id',u.id,'status',u.status,'version',u.version,'archiveSize',u.expected_size,
 'expiresAt',u.expires_at,'partSize',(u.policy->>'partBytes')::bigint) end)
 from public.game_submission_drafts d join public.games g on g.id=d.game_id
 left join public.game_build_uploads u on u.id=d.upload_id and u.game_id=d.game_id and u.created_by=d.created_by
 left join public.game_submissions s on s.build_upload_id=u.id where d.game_id=p_game
$$;

create function public.distribution_developer_drafts(p_actor uuid,p_game uuid default null,p_offset integer default 0) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if p_actor is null then raise exception 'unauthorized'; end if;
 if p_offset<0 or p_offset>100000 then raise exception 'invalid_request'; end if;
 if p_game is not null then perform public.distribution_owned_draft(p_actor,p_game);return public.distribution_draft_snapshot(p_game); end if;
 return coalesce((select jsonb_agg(public.distribution_draft_snapshot(x.game_id) order by x.updated_at desc,x.game_id)
 from(select d.game_id,d.updated_at from public.game_submission_drafts d join public.games g on g.id=d.game_id
 where d.created_by=p_actor and not g.is_published
 and exists(select 1 from public.game_developer_members m where m.game_id=g.id and m.user_id=p_actor)
 and not exists(select 1 from public.game_versions v where v.game_id=g.id and v.status='published')
 order by d.updated_at desc,d.game_id limit 50 offset p_offset) x),'[]');
end $$;

create function public.distribution_save_draft(p_actor uuid,p_game uuid,p_revision bigint,p_metadata jsonb,p_version text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.game_submission_drafts;
begin
 perform public.distribution_owned_draft(p_actor,p_game);
 select * into d from public.game_submission_drafts where game_id=p_game for update;
 if exists(select 1 from public.game_submissions where build_upload_id=d.upload_id) then raise exception 'draft_submitted'; end if;
 if p_metadata is null or jsonb_typeof(p_metadata)<>'object' or octet_length(p_metadata::text)>65536
 or (p_metadata-array['title','studio','releaseDate','description','categories','mobile','technology'])<>'{}'::jsonb
 or p_version is null or length(p_version)>64 then raise exception 'invalid_request'; end if;
 -- A lost response can retry the same save without overwriting another session.
 if d.metadata=p_metadata and d.version=p_version then return public.distribution_draft_snapshot(p_game); end if;
 if p_revision is distinct from d.revision then raise exception 'draft_conflict'; end if;
 if d.upload_id is not null and p_version<>d.version then raise exception 'invalid_state'; end if;
 update public.game_submission_drafts set metadata=p_metadata,version=p_version,revision=revision+1,updated_at=now() where game_id=p_game;
 return public.distribution_draft_snapshot(p_game);
end $$;

create function public.distribution_save_draft_upload(p_actor uuid,p_game uuid,p_request uuid,p_file jsonb,p_hashes jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.game_submission_drafts; item record; u public.game_build_uploads;
begin
 perform public.distribution_owned_draft(p_actor,p_game);
 select * into d from public.game_submission_drafts where game_id=p_game for update;
 if p_request is distinct from d.request_id then raise exception 'draft_conflict'; end if;
 if exists(select 1 from public.game_submissions where build_upload_id=d.upload_id) then raise exception 'draft_submitted'; end if;
 if jsonb_typeof(p_file) is distinct from 'object' or (p_file-array['name','size','lastModified'])<>'{}'::jsonb
 or jsonb_typeof(p_file->'name') is distinct from 'string' or length(p_file->>'name') not between 1 and 255
 or coalesce(p_file->>'size','') !~ '^[1-9][0-9]{0,15}$' or coalesce(p_file->>'lastModified','') !~ '^[0-9]{1,16}$'
 or jsonb_typeof(p_hashes) is distinct from 'object' or octet_length(p_hashes::text)>65536 then raise exception 'invalid_request'; end if;
 for item in select * from jsonb_each_text(p_hashes) loop
   if item.key !~ '^[1-9][0-9]{0,3}$' or item.value !~ '^[a-f0-9]{64}$' then raise exception 'invalid_request'; end if;
 end loop;
 if d.upload_id is not null then
   select * into u from public.game_build_uploads where id=d.upload_id and game_id=p_game and created_by=p_actor;
   if u.status not in ('created','uploading','finalizing','queued','validating','completed') then raise exception 'invalid_state'; end if;
   if (p_file->>'size')::bigint<>u.expected_size then raise exception 'invalid_request'; end if;
 end if;
 update public.game_submission_drafts set file_info=p_file,part_hashes=part_hashes||p_hashes,updated_at=now() where game_id=p_game;
 return public.distribution_draft_snapshot(p_game);
end $$;

create function public.distribution_restart_draft_upload(p_actor uuid,p_game uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.game_submission_drafts; u public.game_build_uploads;
begin
 perform public.distribution_owned_draft(p_actor,p_game);
 select * into d from public.game_submission_drafts where game_id=p_game for update;
 select * into u from public.game_build_uploads where id=d.upload_id;
 if u.id is null or not (u.status in ('failed','expired') or u.status in ('created','uploading','finalizing') and u.expires_at<=now()) then raise exception 'invalid_state'; end if;
 if exists(select 1 from public.game_submissions where build_upload_id=u.id) then raise exception 'draft_submitted'; end if;
 update public.game_submission_drafts set upload_id=null,request_id=gen_random_uuid(),file_info=null,part_hashes='{}',updated_at=now() where game_id=p_game;
 return public.distribution_draft_snapshot(p_game);
end $$;

revoke all on function public.distribution_initialize_draft(),public.distribution_link_draft_upload(),public.distribution_owned_draft(uuid,uuid),
 public.distribution_draft_snapshot(uuid),public.distribution_developer_drafts(uuid,uuid,integer),public.distribution_save_draft(uuid,uuid,bigint,jsonb,text),
 public.distribution_save_draft_upload(uuid,uuid,uuid,jsonb,jsonb),public.distribution_restart_draft_upload(uuid,uuid) from public,anon,authenticated;
grant execute on function public.distribution_initialize_draft(),public.distribution_link_draft_upload(),public.distribution_owned_draft(uuid,uuid),
 public.distribution_draft_snapshot(uuid),public.distribution_developer_drafts(uuid,uuid,integer),public.distribution_save_draft(uuid,uuid,bigint,jsonb,text),
 public.distribution_save_draft_upload(uuid,uuid,uuid,jsonb,jsonb),public.distribution_restart_draft_upload(uuid,uuid) to service_role;
commit;
