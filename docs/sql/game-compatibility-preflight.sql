-- Lecture seule : inventaire des déclarations existantes, sans reclassement.
begin transaction read only;
select mobile_compatible,count(*) from public.games group by mobile_compatible order by count(*) desc;
select mobile_compatibility,count(*) from public.game_submissions group by mobile_compatibility order by count(*) desc;
select to_regprocedure('public.catalogue_page(text,text,text,text,text,integer,integer,text)'),
 to_regprocedure('public.distribution_submit_catalogue(uuid,uuid,text,jsonb,text)'),
 to_regprocedure('public.account_assert_allowed(uuid)');
-- Après migration : contrôler les classifications non vérifiées.
-- select id,title,mobile_compatible from games where game_compatibility(mobile_compatible)='unknown' order by id;
-- select has_function_privilege('anon','distribution_admin_compatibility(uuid,uuid,text,text)','execute'); -- false
-- select has_function_privilege('authenticated','distribution_admin_compatibility(uuid,uuid,text,text)','execute'); -- false
rollback;
