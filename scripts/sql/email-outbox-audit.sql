-- Lecture seule : aucun contenu de message ni contact développeur n'est retourné.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '5s';

select count(*) as total,
       count(*) filter (where sent_at is not null) as acknowledged,
       count(*) filter (where sent_at is null) as pending,
       count(*) filter (where sent_at is null and last_error='attention_required') as attention_required,
       count(*) filter (where sent_at is null and lease_until>now()) as active_leases
from public.game_submission_notifications;

select submission_id, created_at, first_attempt_at, sent_at, attempts,
       next_attempt_at, coalesce(lease_until>now(),false) as active_lease, last_error,
       message is not null as prepared,
       case when message is null then 'not_prepared'
            when message->>'to' like '%developers@chibaskogames.fr%' then 'developers'
            else 'other_review_privately' end as recipient,
       case when message is null then 'not_prepared'
            when coalesce(message->>'html','')='' then 'text_only'
            when message->>'html' like '%chibaskogames-email-logo-v2.png%'
             and message->>'html' like '%light only%' then 'current_markup_detected'
            else 'previous_or_other_html' end as template_hint,
       md5(message::text) as payload_fingerprint
from public.game_submission_notifications
order by created_at desc, submission_id
limit 100;

-- Les hints ne sont pas des numéros de version enregistrés.
-- Le schéma ne conserve ni prepared_at ni identifiant de réponse Resend ici.
-- Ne jamais réinitialiser sent_at, message, attempts ou la clé d'idempotence
-- pour modifier une présentation ou une ancienne destination.
rollback;
