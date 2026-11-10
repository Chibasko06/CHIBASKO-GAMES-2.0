-- Lecture seule. Remplacer uniquement l'UUID de reference par celui de l'upload
-- ou de la soumission. Ne pas appeler distribution_review_job : cette RPC peut
-- récupérer une lease expirée et n'est donc pas une simple consultation.
begin transaction read only;
with requested(reference) as (
  values ('00000000-0000-4000-8000-000000000000'::uuid)
)
select u.id as upload_id,s.id as submission_id,u.game_id,u.version,
  u.status as technical_status,u.error_code,u.attempts,
  u.expected_size,u.created_at,u.updated_at,u.expires_at,u.cleaned_at,
  (u.staging_etag is not null) as staging_finalized,
  u.staging_etag as expected_archive_etag,
  (u.lease_until>now()) as validation_lease_active,
  u.policy as validation_limits,
  u.checkpoint->>'archiveSha256' as archive_sha256,
  u.checkpoint->>'fileCount' as validated_file_count,
  r.decision as administrative_decision,
  v.status as version_status,v.validated_at,
  coalesce((select jsonb_agg(jsonb_build_object('action',event.action,'at',event.created_at))
    from (select e.action,e.created_at from public.game_build_review_events e
      where e.upload_id=u.id order by e.id desc limit 20) event),'[]'::jsonb) as recent_events
from public.game_build_uploads u
left join public.game_submissions s on s.build_upload_id=u.id
left join public.game_build_reviews r on r.upload_id=u.id
left join public.game_versions v on v.id=u.version_id
cross join requested q
where u.id=q.reference or s.id=q.reference;
commit;
