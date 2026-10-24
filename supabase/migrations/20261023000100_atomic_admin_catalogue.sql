begin;

create or replace function public.admin_save_game(
  p_actor uuid, p_game jsonb, p_categories uuid[],
  p_id uuid default null, p_expected_thumbnail text default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_game public.games%rowtype;
  v_previous_thumbnail text;
  v_categories uuid[] := coalesce(p_categories, '{}'::uuid[]);
  v_fields text[] := array['title','slug','game_type','game_url','multiplayer_game_id',
    'is_beta','is_published','thumbnail_url','description','developer_name',
    'release_date_text','mobile_compatible','technology','provider_name','source_page_url'];
begin
  perform user_id from public.admin_users where user_id = p_actor for key share;
  if not found then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if p_game is null or jsonb_typeof(p_game) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_game';
  end if;
  if exists(select 1 from jsonb_object_keys(p_game) k where not (k = any(v_fields)))
    or coalesce(jsonb_typeof(p_game->'title'),'null') <> 'string'
    or coalesce(jsonb_typeof(p_game->'slug'),'null') <> 'string'
    or btrim(p_game->>'title') = '' or btrim(p_game->>'slug') = '' then
    raise exception using errcode = '22023', message = 'invalid_game';
  end if;
  if exists(select 1 from jsonb_each(p_game) e where e.key not in ('is_beta','is_published')
      and jsonb_typeof(e.value) not in ('string','null'))
    or exists(select 1 from jsonb_each(p_game) e where e.key in ('is_beta','is_published')
      and jsonb_typeof(e.value) <> 'boolean') then
    raise exception using errcode = '22023', message = 'invalid_game';
  end if;
  if exists(select 1 from unnest(v_categories) c where c is null)
    or cardinality(v_categories) <> (select count(distinct c) from unnest(v_categories) c) then
    raise exception using errcode = '22023', message = 'invalid_categories';
  end if;

  -- Lock the game before its relations; concurrent updates use the same ordering.
  if p_id is not null then
    select thumbnail_url into v_previous_thumbnail from public.games where id = p_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'game_not_found'; end if;
    if v_previous_thumbnail is distinct from p_expected_thumbnail then
      raise exception using errcode = '40001', message = 'game_changed';
    end if;
  end if;
  perform id from public.categories where id = any(v_categories) order by id for key share;
  if (select count(*) from public.categories where id = any(v_categories)) <> cardinality(v_categories) then
    raise exception using errcode = '22023', message = 'invalid_categories';
  end if;

  v_game := jsonb_populate_record(null::public.games, p_game);
  if p_id is null then
    insert into public.games(title,slug,game_type,game_url,multiplayer_game_id,is_beta,is_published,
      thumbnail_url,description,developer_name,release_date_text,mobile_compatible,technology,provider_name,source_page_url)
    values(v_game.title,v_game.slug,coalesce(v_game.game_type,'classic'),v_game.game_url,v_game.multiplayer_game_id,
      coalesce(v_game.is_beta,false),coalesce(v_game.is_published,true),v_game.thumbnail_url,v_game.description,
      v_game.developer_name,v_game.release_date_text,v_game.mobile_compatible,v_game.technology,v_game.provider_name,v_game.source_page_url)
    returning * into v_game;
  else
    update public.games set title=v_game.title,slug=v_game.slug,game_type=coalesce(v_game.game_type,'classic'),
      game_url=v_game.game_url,multiplayer_game_id=v_game.multiplayer_game_id,is_beta=coalesce(v_game.is_beta,false),
      is_published=coalesce(v_game.is_published,true),thumbnail_url=v_game.thumbnail_url,description=v_game.description,
      developer_name=v_game.developer_name,release_date_text=v_game.release_date_text,mobile_compatible=v_game.mobile_compatible,
      technology=v_game.technology,provider_name=v_game.provider_name,source_page_url=v_game.source_page_url
    where id=p_id returning * into v_game;
    delete from public.game_categories where game_id=p_id;
  end if;
  insert into public.game_categories(game_id,category_id) select v_game.id,c from unnest(v_categories) c;
  return jsonb_build_object('game',to_jsonb(v_game),'previousThumbnail',v_previous_thumbnail);
end;
$$;

revoke all on function public.admin_save_game(uuid,jsonb,uuid[],uuid,text) from public, anon, authenticated;
grant execute on function public.admin_save_game(uuid,jsonb,uuid[],uuid,text) to service_role;

commit;
