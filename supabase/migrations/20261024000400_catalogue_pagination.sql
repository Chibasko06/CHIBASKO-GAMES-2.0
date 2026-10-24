begin;

-- Les statistiques publiques restent agrégées ; aucun identifiant de compte n'est projeté.
create function public.catalogue_game_stats(p_ids uuid[]) returns table(game_id uuid,favorites_count bigint,ratings_count bigint,average_rating numeric,comments_count bigint,likes_count bigint,dislikes_count bigint)
language sql stable security definer set search_path='' as $$
 select g.id,f.n,r.n,coalesce(r.average,0),r.comments,a.likes,a.dislikes
 from public.games g
 cross join lateral(select count(*) n from public.favorites where game_id=g.id) f
 cross join lateral(select count(*) n,round(avg(rating),2) average,count(*) filter(where length(trim(comment))>0) comments from public.game_reviews where game_id=g.id) r
 cross join lateral(select count(*) filter(where reaction='like') likes,count(*) filter(where reaction='dislike') dislikes from public.game_reactions where game_id=g.id) a
 where g.is_published and g.id=any(p_ids) and cardinality(p_ids)<=100;
$$;
revoke all on function public.catalogue_game_stats(uuid[]) from public;
grant execute on function public.catalogue_game_stats(uuid[]) to anon,authenticated,service_role;

create function public.catalogue_device(p_value text) returns text
language sql immutable set search_path='' as $$
 with normalized as(select lower(translate(coalesce(p_value,''),'éèêëàâäîïôöùûüç','eeeeaaaiioouuuc')) value),
 scores as(select
 (select count(*) from unnest(array['yes','oui','true','mobile','smartphone','touch','tactile','compatible']) word where strpos(value,word)>0) mobile,
 (select count(*) from unnest(array['no','non','false','pc','desktop','ordinateur','clavier','souris']) word where strpos(value,word)>0) desktop from normalized)
 select case when mobile>desktop then 'mobile' when desktop>mobile then 'desktop' else 'unknown' end from scores;
$$;
revoke all on function public.catalogue_device(text) from public;
grant execute on function public.catalogue_device(text) to anon,authenticated,service_role;

create function public.catalogue_page(p_search text default '',p_category text default 'all',p_type text default 'all',p_device text default 'all',p_sort text default 'popular',p_offset integer default 0,p_limit integer default 24,p_slug text default null)
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
 and (p_device='all' or public.catalogue_device(g.mobile_compatible)=p_device)
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
revoke all on function public.catalogue_page(text,text,text,text,text,integer,integer,text) from public;
grant execute on function public.catalogue_page(text,text,text,text,text,integer,integer,text) to anon,authenticated,service_role;

create function public.catalogue_home(p_limit integer default 10) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('category',to_jsonb(c),'games',p.result->'items') order by c.name,c.id),'[]'::jsonb)
 from public.categories c cross join lateral(select public.catalogue_page(p_category=>c.slug,p_limit=>p_limit) result) p
 where jsonb_array_length(p.result->'items')>0;
$$;
revoke all on function public.catalogue_home(integer) from public;
grant execute on function public.catalogue_home(integer) to anon,authenticated,service_role;

-- Les agrégats par jeu ne peuvent pas exploiter l'unicité (user_id,game_id).
create index if not exists favorites_game_id_catalogue_idx on public.favorites(game_id);

-- Les e-mails Auth ne quittent la base que pour une page admin autorisée.
create function public.catalogue_admin_users(p_actor uuid,p_offset integer default 0,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_offset is null or p_offset<0 or p_offset>2100000 or p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid_page' using errcode='22023'; end if;
 with page as(select p.id,p.username,p.display_name,p.avatar_url,p.bio,p.created_at,u.email
 from public.profiles p left join auth.users u on u.id=p.id order by p.created_at desc,p.id offset p_offset limit p_limit)
 select jsonb_build_object('users',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id) from page),'[]'::jsonb),'total',(select count(*) from public.profiles)) into result;
 return result;
end $$;
revoke all on function public.catalogue_admin_users(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.catalogue_admin_users(uuid,integer,integer) to service_role;

create function public.catalogue_recent_history(p_user uuid,p_limit integer default 6) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if current_user<>'service_role' and auth.uid() is distinct from p_user then raise exception 'forbidden' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_limit' using errcode='22023'; end if;
 with latest as(
 select distinct on(h.game_id) h.id,h.game_id,h.played_at from public.play_history h
 where h.user_id=p_user and exists(select 1 from public.games g where g.id=h.game_id and g.is_published)
 order by h.game_id,h.played_at desc,h.id),
 page as(select * from latest order by played_at desc,id limit p_limit),
 projected as(select h.id history_id,h.played_at,
 jsonb_build_object('id',g.id,'title',g.title,'slug',g.slug,'game_url',g.game_url,'thumbnail_url',g.thumbnail_url,'description',g.description,'developer_name',g.developer_name,'technology',g.technology,'created_at',g.created_at,'game_type',g.game_type,'active_version_id',g.active_version_id,'is_published',g.is_published,'is_beta',g.is_beta,'multiplayer_game_id',g.multiplayer_game_id,'views_count',g.views_count,'play_count',g.play_count,'mobile_compatible',g.mobile_compatible,'release_date_text',g.release_date_text,'provider_name',g.provider_name,'source_page_url',g.source_page_url,'catalogue_source',g.catalogue_source) game
 from page h join public.games g on g.id=h.game_id)
 select coalesce(jsonb_agg(jsonb_build_object('historyId',history_id,'played_at',played_at,'game',game) order by played_at desc,history_id),'[]'::jsonb) into result from projected;
 return result;
end $$;
revoke all on function public.catalogue_recent_history(uuid,integer) from public,anon;
grant execute on function public.catalogue_recent_history(uuid,integer) to authenticated,service_role;
create index play_history_recent_distinct_idx on public.play_history(user_id,game_id,played_at desc,id);
commit;
