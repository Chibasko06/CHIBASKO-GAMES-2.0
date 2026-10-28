begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('fc000000-0000-4000-8000-000000000001','handles-a@example.test','{"username":"Joueur_Alpha"}'),
 ('fc000000-0000-4000-8000-000000000002','handles-b@example.test','{"username":"joueur_alpha"}'),
 ('fc000000-0000-4000-8000-000000000003','handles-c@example.test','{"username":"admin"}');

do $$
declare actor uuid:='fc000000-0000-4000-8000-000000000001'; other uuid:='fc000000-0000-4000-8000-000000000002'; result jsonb; invalid text;
begin
 if (select username from public.profiles where id=actor)<>'joueur_alpha' then raise exception 'Normalisation absente';end if;
 if (select username from public.profiles where id=other)='joueur_alpha' then raise exception 'Collision Auth';end if;
 if (select username from public.profiles where id='fc000000-0000-4000-8000-000000000003')='admin' then raise exception 'Pseudo réservé attribué';end if;
 update public.profiles set username='nouveau-joueur' where id=actor;
 result:=public.public_profile_resolve('@JOUEUR_ALPHA');
 if result->>'username'<>'nouveau-joueur' or (result->>'id')::uuid<>actor then raise exception 'Ancien pseudo perdu';end if;
 if public.public_profile_resolve(actor::text)<>result or public.public_profile_resolve('nouveau-joueur')<>result then raise exception 'Alias incompatible';end if;
 if public.public_profile_resolve('@inexistant') is not null or public.public_profile_resolve('@../admin') is not null then raise exception 'Résolution invalide';end if;
 begin update public.profiles set username='JOUEUR_ALPHA' where id=other;raise exception 'Ancien pseudo volé';exception when unique_violation then null;end;
 update public.profiles set username='JOUEUR_ALPHA' where id=actor;
 if (select username from public.profiles where id=actor)<>'joueur_alpha' then raise exception 'Casse non canonique';end if;
 foreach invalid in array array['admin','ab','nom avec espace','@joueur','éclair','joueur/ami','-joueur','joueur-',repeat('a',33)] loop
  begin update public.profiles set username=invalid where id=actor;raise exception 'Pseudo invalide accepté : %',invalid;exception when check_violation then null;end;
 end loop;
 begin
  update public.profiles set username='nom-annule' where id=actor;
  raise exception 'fixture_rollback';
 exception when raise_exception then null;
 end;
 update public.profiles set username='nom-annule' where id=other;
 if public.public_profile_resolve('@joueur_alpha')->>'id'<>actor::text then raise exception 'Rollback incomplet';end if;
end $$;

insert into auth.users(id,email,raw_user_meta_data) values
 ('fc000000-0000-4000-8000-000000000004','handles-history@example.test','{"username":"nouveau-joueur"}');
do $$ begin
 if (select username from public.profiles where id='fc000000-0000-4000-8000-000000000004')='nouveau-joueur' then raise exception 'Historique réattribué à une inscription';end if;
end $$;

insert into public.admin_users(user_id) values('fc000000-0000-4000-8000-000000000001');
select public.distribution_register_game('fc000000-0000-4000-8000-000000000001',gen_random_uuid(),'Jeu identifiants');
set local role anon;
do $$ declare result jsonb;begin
 result:=public.public_profile_resolve('@Joueur_Alpha');
 if result->'roles'->>'admin'<>'true' or result->'roles'->>'developer'<>'true' then raise exception 'Badges perdus';end if;
 if public.public_profiles_page('@JOUEUR_ALPHA')->>'total'<>'1' then raise exception 'Recherche @pseudo absente';end if;
 if result ? 'email' or result ? 'user_metadata' or result ? 'username_hash' then raise exception 'Données privées exposées';end if;
 begin perform * from public.profile_username_reservations;raise exception 'Historique lisible';exception when insufficient_privilege then null;end;
 begin delete from public.profile_username_reservations;raise exception 'Historique modifiable';exception when insufficient_privilege then null;end;
end $$;
reset role;

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000002',true);
set local role authenticated;
update public.profiles set username='mon-identifiant' where id=auth.uid();
do $$ declare affected integer;begin
 update public.profiles set username='compte-detourne' where id='fc000000-0000-4000-8000-000000000001';
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Modification cross-user';end if;
 begin perform public.reserve_profile_username();raise exception 'Trigger exposé';exception when insufficient_privilege then null;end;
end $$;
reset role;

do $$ declare job uuid; lease uuid;begin
 job:=(public.distribution_account_request('fc000000-0000-4000-8000-000000000003','fc000000-0000-4000-8000-000000000003')->>'id')::uuid;
 lease:=(public.distribution_account_claim(job)->>'lease')::uuid;
 perform public.distribution_account_prepare(job,lease);
 delete from auth.users where id='fc000000-0000-4000-8000-000000000003';
 perform public.distribution_account_auth_deleted(job,lease);
end $$;
do $$ begin
 if public.public_profile_resolve('@joueur-admin') is not null then raise exception 'Compte supprimé résolu';end if;
 if not exists(select 1 from public.profile_username_reservations where username_hash=sha256(convert_to('joueur-admin','UTF8')) and profile_id is null) then raise exception 'Réservation non anonymisée';end if;
 begin update public.profiles set username='joueur-admin' where id='fc000000-0000-4000-8000-000000000002';raise exception 'Réattribution après suppression';exception when unique_violation then null;end;
 if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (username)') then raise exception 'Unicité username absente';end if;
end $$;
rollback;
