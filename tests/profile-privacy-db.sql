begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('fd000000-0000-4000-8000-000000000001','privacy-a@example.test','{"username":"privacy-alpha","full_name":"Nom OAuth privé"}'),
 ('fd000000-0000-4000-8000-000000000002','privacy-b@example.test','{"username":"privacy-beta"}');
insert into public.admin_users(user_id) values('fd000000-0000-4000-8000-000000000002');
insert into public.games(id,title,slug,game_url) values
 ('fd000000-0000-4000-8000-000000000003','Confidentialité','privacy-fixture','https://example.test/game');
insert into public.favorites(user_id,game_id) values
 ('fd000000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000003');
insert into public.game_reviews(user_id,game_id,rating,comment) values
 ('fd000000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000003',5,'Avis public');

set local role anon;
do $$ declare item jsonb; column_name text; begin
 if has_any_column_privilege(current_user,'public.profiles','SELECT') then raise exception 'Lecture brute anonyme autorisée';end if;
 begin perform * from public.profiles;raise exception 'Table personnelle exposée';exception when insufficient_privilege then null;end;
 select to_jsonb(p) into item from public.public_profiles p where username='privacy-alpha';
 if item is null or (select count(*) from jsonb_object_keys(item))<>5
 or item ?| array['display_name','xp_points','last_xp_tick_at','email'] then raise exception 'Projection privée';end if;
 foreach column_name in array array['display_name','xp_points','last_xp_tick_at'] loop
  begin execute format('select %I from public.public_profiles',column_name);raise exception 'Colonne privée accessible';exception when undefined_column then null;end;
 end loop;
 begin update public.public_profiles set bio='Usurpation';raise exception 'Vue modifiable';exception when insufficient_privilege then null;end;
 item:=public.public_profile_resolve('@PRIVACY-ALPHA');
 if item is null or item::text like '%OAuth%' or item ? 'display_name' then raise exception 'RPC privée';end if;
 if public.public_profile_resolve('fd000000-0000-4000-8000-000000000001')<>item then raise exception 'Ancien lien cassé';end if;
 if public.public_profiles_page('@privacy-alpha')->>'total'<>'1' then raise exception 'Recherche cassée';end if;
 begin perform public.admin_console_users('fd000000-0000-4000-8000-000000000002');raise exception 'RPC admin publique';exception when insufficient_privilege then null;end;
 select to_jsonb(r) into item from public.get_game_reviews('fd000000-0000-4000-8000-000000000003') r;
 if item->>'username'<>'privacy-alpha' or item::text like '%OAuth%' then raise exception 'Avis invalide';end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
do $$ begin
 if (select display_name from public.profiles where id=auth.uid())<>'Nom OAuth privé' then raise exception 'Propriétaire privé de ses données';end if;
 if exists(select 1 from public.profiles where id='fd000000-0000-4000-8000-000000000002') then raise exception 'Lecture cross-user';end if;
 if (select count(*) from public.favorites)<>1 then raise exception 'Favoris personnels perdus';end if;
 update public.profiles set bio='Biographie modifiée' where id=auth.uid();
 if public.public_profile_resolve('@privacy-alpha')->>'bio'<>'Biographie modifiée' then raise exception 'Mise à jour invisible';end if;
end $$;
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.profiles where id='fd000000-0000-4000-8000-000000000001') then raise exception 'JWT administrateur contourne RLS';end if;
 if exists(select 1 from public.favorites) then raise exception 'Favoris tiers exposés';end if;
 if public.public_profile_resolve('@privacy-beta')->'roles'->>'admin'<>'true' then raise exception 'Badge perdu';end if;
end $$;
reset role;

set local role service_role;
do $$ begin
 if (select display_name from public.profiles where id='fd000000-0000-4000-8000-000000000001')<>'Nom OAuth privé' then raise exception 'Outils serveur cassés';end if;
 if not (public.admin_console_users('fd000000-0000-4000-8000-000000000002')->'users') @> '[{"id":"fd000000-0000-4000-8000-000000000001","display_name":"Nom OAuth privé"}]'::jsonb then raise exception 'Projection administrative cassée';end if;
end $$;
reset role;
-- Même une politique permissive supplémentaire reste soumise à la frontière.
create policy fixture_public_profiles on public.profiles for select using(true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.profiles where id='fd000000-0000-4000-8000-000000000001') then raise exception 'Politique permissive contourne la frontière';end if;
end $$;
reset role;
rollback;
