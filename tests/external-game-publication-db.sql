begin;
insert into auth.users(id) values ('ef400000-0000-4000-8000-000000000001'),('ef400000-0000-4000-8000-000000000002'),
 ('ef400000-0000-4000-8000-000000000099');
insert into public.admin_users(user_id) values ('ef400000-0000-4000-8000-000000000001');
insert into public.games(id,title,slug,game_url,game_type,is_published)
 values ('ef400000-0000-4000-8000-000000000003','Fixture external','fixture-external','https://play.example.com/old','classic',false);
insert into public.games(id,title,slug,game_url,game_type,is_published)
 values ('ef400000-0000-4000-8000-000000000007','Fixture legacy','fixture-legacy','https://html5.gamemonetize.com/fixture/','classic',true);
insert into public.game_developer_members(game_id,user_id,role)
 values ('ef400000-0000-4000-8000-000000000003','ef400000-0000-4000-8000-000000000002','owner');
insert into public.game_submissions(id,name_or_studio,email,game_title,demo_url,game_type,description)
 values ('ef400000-0000-4000-8000-000000000004','Fixture','fixture@example.com','Fixture external','https://play.example.com/new','classic','Fixture');
insert into public.game_external_revisions(id,submission_id,game_id,developer_id,submitted_url,submitted_origin)
 values ('ef400000-0000-4000-8000-000000000005','ef400000-0000-4000-8000-000000000004','ef400000-0000-4000-8000-000000000003','ef400000-0000-4000-8000-000000000002','https://play.example.com/new','https://play.example.com');
do $$
declare admin_id uuid:='ef400000-0000-4000-8000-000000000001'; player_id uuid:='ef400000-0000-4000-8000-000000000002';
revision uuid:='ef400000-0000-4000-8000-000000000005'; game uuid:='ef400000-0000-4000-8000-000000000003';
begin
  if public.distribution_external_preview(player_id,revision)->>'url' <> 'https://play.example.com/new'
    or public.distribution_external_preview(admin_id,revision)->>'revisionId' <> revision::text then
    raise exception 'incorrect preview projection';
  end if;
  begin
    perform public.distribution_external_preview(null,revision);
    raise exception 'anonymous preview succeeded';
  exception when raise_exception then if sqlerrm <> 'game_not_found' then raise; end if; end;
  begin
    perform public.distribution_external_preview('ef400000-0000-4000-8000-000000000099',revision);
    raise exception 'foreign preview succeeded';
  exception when raise_exception then if sqlerrm <> 'game_not_found' then raise; end if; end;
  if public.distribution_external_public_launch(game)->>'kind' <> 'unavailable'
    or public.distribution_external_public_launch('ef400000-0000-4000-8000-000000000007')->>'kind' <> 'legacy' then
    raise exception 'invalid initial launch kind';
  end if;
  begin
    perform public.distribution_external_review(player_id,revision,'approve',null,'https://play.example.com',true);
    raise exception 'unauthorized approval succeeded';
  exception when raise_exception then if sqlerrm <> 'forbidden' then raise; end if; end;
  begin
    perform public.distribution_external_review(admin_id,revision,'publish');
    raise exception 'publication without approval succeeded';
  exception when raise_exception then if sqlerrm <> 'external_review_conflict' then raise; end if; end;
  perform public.distribution_external_review(admin_id,revision,'approve',null,'https://play.example.com',true);
  if public.distribution_external_public_launch(game)->>'kind' <> 'unavailable' then
    raise exception 'approval exposed a private revision';
  end if;
  perform public.distribution_external_review(admin_id,revision,'publish');
  if public.distribution_external_public_launch(game)->>'url' <> 'https://play.example.com/new' then
    raise exception 'incorrect public projection';
  end if;
  if not exists(select 1 from public.games where id=game and is_published and game_url='https://play.example.com/new' and external_revision_id=revision)
    then raise exception 'wrong catalogue URL'; end if;
  begin
    update public.games set game_url='https://other.example.com/' where id=game;
    raise exception 'catalogue overwrite succeeded';
  exception when raise_exception then if sqlerrm <> 'external_catalogue_conflict' then raise; end if; end;
  perform public.distribution_external_review(admin_id,revision,'suspend','Fixture');
  if (select is_published from public.games where id=game) then raise exception 'suspension failed'; end if;
  if public.distribution_external_public_launch(game)->>'kind' <> 'unavailable' then raise exception 'suspended launch'; end if;
  perform public.distribution_external_review(admin_id,revision,'withdraw','Fixture');
  if public.distribution_external_public_launch(game)->>'kind' <> 'unavailable' then raise exception 'withdrawn launch'; end if;
  if has_function_privilege('anon','public.distribution_external_preview(uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.distribution_external_public_launch(uuid)','execute') then
    raise exception 'public RPC grant';
  end if;
end;
$$;
rollback;
