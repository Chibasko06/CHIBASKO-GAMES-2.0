\set ON_ERROR_STOP on
begin;
insert into storage.buckets(id,name,public) values('game-thumbnails','game-thumbnails',true);
insert into storage.objects(bucket_id,name) values('avatars','shared-avatar.png'),('game-thumbnails','shared-thumbnail.png');
grant usage on schema storage to anon,authenticated;
grant select,insert,update on storage.objects to authenticated;
grant select on storage.objects to anon;
-- Une policy permissive supplémentaire ne doit pas contourner les protections restrictives.
create policy storage_fixture_permissive on storage.objects for all to authenticated using(true) with check(true);

do $$declare actor uuid:=gen_random_uuid(); administrator uuid:=gen_random_uuid(); job uuid; lease uuid; claim jsonb;begin
 insert into auth.users(id,email) values(actor,'storage-actor@example.test');
 insert into auth.users(id,email) values(administrator,'storage-admin@example.test');
 insert into public.admin_users(user_id) values(administrator);
 if public.distribution_account_storage_owned(actor) then raise exception 'Objet partagé attribué arbitrairement'; end if;
 insert into storage.objects(bucket_id,name,owner) values('avatars',actor||'/legacy.png',actor);
 claim:=public.distribution_account_request(actor,actor);job:=(claim->>'id')::uuid;
 claim:=public.distribution_account_claim(job);lease:=(claim->>'lease')::uuid;
 if public.distribution_account_prepare(job,lease)<>'review_required' then raise exception 'Propriété Storage ignorée'; end if;
 if not exists(select 1 from public.profiles where id=actor) or not exists(select 1 from auth.users where id=actor)
  or exists(select 1 from public.game_account_cleanup where job_id=job)
  or (select last_error from public.game_account_deletions where id=job)<>'storage_owned_objects' then raise exception 'Suppression partielle avant contrôle Storage'; end if;
 -- La résolution externe est simulée ; aucun objet n'est supprimé par les RPC.
 update storage.objects set owner=null,owner_id=actor::text where owner=actor;
 if not public.distribution_account_storage_owned(actor) then raise exception 'owner_id non reconnu'; end if;
 update storage.objects set owner_id=null where owner_id=actor::text;
 update storage.buckets set owner_id=actor::text where id='avatars';
 if not public.distribution_account_storage_owned(actor) then raise exception 'Bucket propriétaire ignoré'; end if;
 update storage.buckets set owner_id=null where id='avatars';
 perform public.distribution_account_review(administrator,job,null);
 claim:=public.distribution_account_claim(job);lease:=(claim->>'lease')::uuid;
 if public.distribution_account_prepare(job,lease)<>'prepared' then raise exception 'Reprise Storage impossible'; end if;
 if (select count(*) from storage.objects)<>3 or not exists(select 1 from storage.objects where name='shared-avatar.png' and owner is null and owner_id is null)
  or not exists(select 1 from storage.objects where name='shared-thumbnail.png') then raise exception 'Objet Storage supprimé arbitrairement'; end if;
 begin
  alter table storage.objects drop column owner,drop column owner_id;
  perform public.distribution_account_storage_owned(actor);raise exception 'Schéma Storage inconnu accepté';
 exception when others then if sqlerrm<>'storage_ownership_schema_unknown' then raise; end if;end;
end $$;
set local role anon;
do $$begin
 if not exists(select 1 from storage.objects where bucket_id='avatars' and name='shared-avatar.png') then raise exception 'Lecture historique supprimée'; end if;
end $$;
reset role;
set local role authenticated;
do $$declare bucket text; changed integer;begin
 foreach bucket in array array['avatars','game-thumbnails'] loop
  begin
   insert into storage.objects(bucket_id,name) values(bucket,'new-upload.png');raise exception 'Écriture Storage historique autorisée';
  exception when insufficient_privilege then null;end;
 end loop;
 update storage.objects set name='replaced.png' where name in ('shared-avatar.png','shared-thumbnail.png');
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Modification des fichiers historiques autorisée'; end if;
 begin perform public.distribution_account_storage_owned(gen_random_uuid());raise exception 'Inventaire privé exposé';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
