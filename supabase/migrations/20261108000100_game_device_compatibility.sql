begin;
set local lock_timeout='5s';

-- Le champ historique reste la source commune. Aucun jeu existant n’est reclassé.
create function public.game_compatibility(p_value text) returns text
language sql immutable set search_path='' as $$
 with normalized as(select lower(translate(trim(coalesce(p_value,'')),'éèêëàâäîïôöùûüç','eeeeaaaiioouuuc')) value),scores as(select value,
 (select count(*) from unnest(array['yes','oui','true','mobile','smartphone','touch','tactile','compatible']) word where strpos(value,word)>0) mobile,
 (select count(*) from unnest(array['no','non','false','pc','desktop','ordinateur','clavier','souris']) word where strpos(value,word)>0) desktop from normalized)
 select case when value in('platform:desktop','platform:mobile','platform:both','platform:unknown') then substr(value,10) when mobile>desktop then 'both' when desktop>mobile then 'desktop' else 'unknown' end from scores;
$$;
revoke all on function public.game_compatibility(text) from public;
grant execute on function public.game_compatibility(text) to anon,authenticated,service_role;

create or replace function public.catalogue_device(p_value text) returns text
language sql immutable set search_path='' as $$select public.game_compatibility(p_value)$$;

create or replace function public.catalogue_page(p_search text default '',p_category text default 'all',p_type text default 'all',p_device text default 'all',p_sort text default 'popular',p_offset integer default 0,p_limit integer default 24,p_slug text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 or p_offset>1000000
 or p_search is null or length(p_search)>200 or p_category is null or length(p_category)>100
 or p_type not in('all','classic','multiplayer') or p_type is null
 or p_device not in('all','mobile','desktop') or p_device is null
 or p_sort not in('popular','recent','title-asc','title-desc','favorites','likes','rating') or p_sort is null
 or length(p_slug)>200 then raise exception 'invalid_catalogue_query' using errcode='22023'; end if;
 with candidates as materialized(
 select g.id,g.title,g.views_count,g.created_at
 from public.games g where g.is_published and (p_slug is null or g.slug=p_slug)
 and (p_type='all' or g.game_type=case p_type when 'multiplayer' then 'multiplayer_chibasko' else 'classic' end)
 and (p_device='all' or public.game_compatibility(g.mobile_compatible) in(p_device,'both'))
 and (p_category='all' or exists(select 1 from public.game_categories gc join public.categories c on c.id=gc.category_id where gc.game_id=g.id and c.slug=p_category))
 and (trim(p_search)='' or strpos(lower(concat_ws(' ',g.title,g.description,g.developer_name,g.technology,(select string_agg(c.name,' ') from public.game_categories gc join public.categories c on c.id=gc.category_id where gc.game_id=g.id))),lower(trim(p_search)))>0)),
 ranked as(
 select c.*,s.* from candidates c cross join lateral public.catalogue_game_stats(array[c.id]) s),
 ordered as(
 select ranked.*,row_number() over(order by
 case when p_sort='recent' then created_at end desc,
 case when p_sort='title-asc' then translate(replace(replace(replace(replace(lower(title),'œ','oe'),'æ','ae'),'Œ','oe'),'Æ','ae'),'éèêëàâäîïôöùûüçÉÈÊËÀÂÄÎÏÔÖÙÛÜÇ','eeeeaaaiioouuuceeeeaaaiioouuuc') end collate "C" asc,
 case when p_sort='title-desc' then translate(replace(replace(replace(replace(lower(title),'œ','oe'),'æ','ae'),'Œ','oe'),'Æ','ae'),'éèêëàâäîïôöùûüçÉÈÊËÀÂÄÎÏÔÖÙÛÜÇ','eeeeaaaiioouuuceeeeaaaiioouuuc') end collate "C" desc,
 case when p_sort='favorites' then favorites_count end desc,
 case when p_sort='likes' then likes_count end desc,
 case when p_sort='rating' then average_rating end desc,
 case when p_sort='rating' then ratings_count end desc,
 case when p_sort='popular' then views_count end desc,
 case when p_sort='popular' then likes_count end desc,
 case when p_sort='popular' then average_rating end desc,id) position from ranked),
 page as(select * from ordered order by position offset p_offset limit p_limit),
 projected as(
 select g.id,g.title,g.slug,g.game_url,g.thumbnail_url,g.description,g.developer_name,g.release_date_text,g.mobile_compatible,g.technology,g.provider_name,g.source_page_url,g.views_count,g.play_count,g.is_published,g.created_at,g.game_type,g.multiplayer_game_id,g.is_beta,g.active_version_id,g.catalogue_source,
 p.position,p.game_id,p.favorites_count,p.ratings_count,p.average_rating,p.comments_count,p.likes_count,p.dislikes_count,
 coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug,'created_at',c.created_at) order by c.name,c.id) from public.game_categories gc join public.categories c on c.id=gc.category_id where gc.game_id=g.id),'[]'::jsonb) categories,
 (select v.manifest->'capabilities' from public.game_versions v where v.id=g.active_version_id and v.game_id=g.id and v.status='published') runtime_capabilities
 from page p join public.games g on g.id=p.id)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(projected)-'position' order by position) from projected),'[]'::jsonb),'total',(select count(*) from candidates)) into result;
 return result;
end $$;

create function public.catalogue_home_for_device(p_device text,p_limit integer default 10) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('category',to_jsonb(c),'games',p.result->'items') order by c.name,c.id),'[]'::jsonb)
 from public.categories c cross join lateral(select public.catalogue_page(p_category=>c.slug,p_device=>p_device,p_limit=>p_limit) result) p where jsonb_array_length(p.result->'items')>0;
$$;
revoke all on function public.catalogue_home_for_device(text,integer) from public;
grant execute on function public.catalogue_home_for_device(text,integer) to anon,authenticated,service_role;

create or replace function public.distribution_submit_catalogue(p_actor uuid,p_upload uuid,p_kind text,p_metadata jsonb,p_cover text default null) returns uuid
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u public.game_build_uploads; g public.games; sid uuid; ids uuid[]; released date;
begin
 perform public.account_assert_allowed(p_actor);
 perform public.distribution_editorial_context(p_actor,p_upload);
 u:=public.distribution_get_upload(p_actor,p_upload);
 select * into g from public.games where id=u.game_id;
 if p_kind is null or p_kind not in ('new','update') or jsonb_typeof(p_metadata) is distinct from 'object' then raise exception 'invalid_request'; end if;
 if p_kind='new' then
   if not exists(select 1 from public.game_developer_registrations where game_id=u.game_id and actor=p_actor)
     or g.is_published then raise exception 'forbidden'; end if;
   if (p_metadata - array['title','studio','releaseDate','description','categories','mobile','technology','website'])<>'{}'::jsonb
     or (jsonb_typeof(p_metadata->'mobile') is distinct from 'boolean' and coalesce(p_metadata->>'mobile','') not in('desktop','mobile','both'))
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

   if (select submission_kind from public.game_submissions where id=sid) is null then
     update public.game_submissions set submission_kind='new',name_or_studio=btrim(p_metadata->>'studio'),
       release_date=released,technology=btrim(p_metadata->>'technology'),cover_image_url=p_cover,category_ids=ids,
       mobile_compatibility=case when jsonb_typeof(p_metadata->'mobile')='boolean' then case when (p_metadata->>'mobile')::boolean then 'Oui' else 'Non' end else 'platform:'||(p_metadata->>'mobile') end where id=sid;
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
create or replace function public.distribution_save_draft(p_actor uuid,p_game uuid,p_revision bigint,p_metadata jsonb,p_version text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.game_submission_drafts;
begin
 perform public.account_assert_allowed(p_actor);
 perform public.distribution_owned_draft(p_actor,p_game);
 select * into d from public.game_submission_drafts where game_id=p_game for update;
 if exists(select 1 from public.game_submissions where build_upload_id=d.upload_id) then raise exception 'draft_submitted'; end if;
 if p_metadata is null or jsonb_typeof(p_metadata)<>'object' or octet_length(p_metadata::text)>65536
 or (p_metadata-array['title','studio','releaseDate','description','categories','mobile','technology'])<>'{}'::jsonb
 or (p_metadata->'mobile' is not null and p_metadata->'mobile'<>'null'::jsonb and jsonb_typeof(p_metadata->'mobile')<>'boolean' and coalesce(p_metadata->>'mobile','') not in('desktop','mobile','both'))
 or p_version is null or length(p_version)>64 then raise exception 'invalid_request'; end if;

 if d.metadata=p_metadata and d.version=p_version then return public.distribution_draft_snapshot(p_game); end if;
 if p_revision is distinct from d.revision then raise exception 'draft_conflict'; end if;
 if d.upload_id is not null and p_version<>d.version then raise exception 'invalid_state'; end if;
 update public.game_submission_drafts set metadata=p_metadata,version=p_version,revision=revision+1,updated_at=now() where game_id=p_game;
 return public.distribution_draft_snapshot(p_game);
end $$;
revoke all on function public.distribution_submit_catalogue(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.distribution_save_draft(uuid,uuid,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.distribution_submit_catalogue(uuid,uuid,text,jsonb,text),public.distribution_save_draft(uuid,uuid,bigint,jsonb,text) to service_role;

create function public.distribution_admin_compatibility(p_actor uuid,p_upload uuid,p_value text,p_expected text) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' set statement_timeout='10s' as $$
declare u public.game_build_uploads;s public.game_submissions;begin
 perform public.account_assert_allowed(p_actor);
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden';end if;
 if p_value is null or p_value not in('desktop','mobile','both','unknown') then raise exception 'invalid_request';end if;
 select * into u from public.game_build_uploads where id=p_upload for update;
 if not found then raise exception 'upload_not_found';end if;
 perform 1 from public.games where id=u.game_id for update;
 select * into s from public.game_submissions where build_upload_id=u.id for update;
 if not found or s.submission_kind is distinct from 'new' then raise exception 'invalid_state';end if;
 if s.mobile_compatibility='platform:'||p_value then return public.distribution_review_snapshot(u.id);end if;
 if s.mobile_compatibility is distinct from p_expected then raise exception 'request_conflict';end if;
 update public.game_submissions set mobile_compatibility='platform:'||p_value where id=s.id;
 -- Une correction éditoriale ne change ni la publication ni les ressources du jeu.
 if exists(select 1 from public.game_versions where id=u.version_id and status='published') then
  update public.games set mobile_compatible='platform:'||p_value where id=u.game_id and active_version_id=u.version_id;
 end if;
 update public.game_build_reviews set checklist=case when decision='published' then checklist else '{}'::jsonb end,reviewed_at=case when decision='published' then reviewed_at else null end,updated_at=now() where upload_id=u.id;
 insert into public.game_build_review_events(upload_id,actor,action) values(u.id,p_actor,'compatibility:'||p_value);
 return public.distribution_review_snapshot(u.id);
end $$;
revoke all on function public.distribution_admin_compatibility(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.distribution_admin_compatibility(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
