begin;
insert into auth.users(id,email) values('fa000000-0000-4000-8000-000000000001','admin-profile@example.test');
insert into public.profiles(id,username,bio) values('fa000000-0000-4000-8000-000000000001','Profil initial',null)
on conflict(id) do update set username=excluded.username,bio=excluded.bio;
set local role service_role;
do $$
declare affected integer;
begin
 update public.profiles set bio='Modification concurrente' where id='fa000000-0000-4000-8000-000000000001';
 update public.profiles set username='Brouillon ancien',bio='Ancienne bio'
 where id='fa000000-0000-4000-8000-000000000001' and username='Profil initial' and bio is null and avatar_url is null;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Écrasement d’un profil concurrent';end if;
 if (select bio from public.profiles where id='fa000000-0000-4000-8000-000000000001')<>'Modification concurrente' then raise exception 'Modification concurrente perdue';end if;
 update public.profiles set username='Profil confirmé',bio='Bio confirmée'
 where id='fa000000-0000-4000-8000-000000000001' and username='Profil initial' and bio='Modification concurrente' and avatar_url is null;
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Écriture confirmée impossible';end if;
 if public.public_profiles_page('',1,'all','fa000000-0000-4000-8000-000000000001')->'items'->0->'roles'<>'{"admin":false,"developer":false}'::jsonb then raise exception 'Rôles modifiés par le profil';end if;
end $$;
reset role;
rollback;
