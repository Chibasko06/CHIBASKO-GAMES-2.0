begin transaction read only;
set local statement_timeout='30s';

-- Les lignes retournées doivent être arbitrées avant la migration des identifiants publics.
select id,username,lower(btrim(username)) as normalized_username
from public.profiles
where lower(btrim(username)) !~ '^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$'
 or lower(btrim(username)) in ('admin','administrator','administrateur','moderator','moderateur','support','system','api','login','register','deleted','chibasko','chibaskogames','chibasko-games');

select lower(btrim(username)) as normalized_username,count(*) as profiles
from public.profiles group by lower(btrim(username)) having count(*)>1;
commit;
