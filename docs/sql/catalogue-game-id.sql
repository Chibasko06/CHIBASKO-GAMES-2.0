\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned
begin transaction read only;
set local statement_timeout='15s';
select to_regclass('public.game_versions') is not null as has_versions \gset
\if :has_versions
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'slug',g.slug,'gameType',g.game_type,
  'activeVersionId',g.active_version_id,'versionGameId',v.game_id,'versionStatus',v.status,'manifest',v.manifest)),'[]'::jsonb)
 from public.games g left join public.game_versions v on v.id=g.active_version_id where g.slug=:'game_slug';
\else
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'slug',g.slug,'gameType',g.game_type,
  'activeVersionId',null,'versionGameId',null,'versionStatus',null,'manifest',null)),'[]'::jsonb)
 from public.games g where g.slug=:'game_slug';
\endif
rollback;
