-- Nur lesen: prueft, dass Gruppenersatztermine ab jetzt statt erst ab dem Originaltermin gelten.

select
  pg_get_functiondef(
    'public.get_booking_change_alternatives(uuid)'::regprocedure
  ) like '%session.start_at >= now()%'
    and pg_get_functiondef(
      'public.get_booking_change_alternatives(uuid)'::regprocedure
    ) not like '%greatest(change_record.original_start_at, now())%'
    as alternatives_start_from_now,
  pg_get_functiondef(
    'public.recover_group_booking(uuid,uuid)'::regprocedure
  ) like '%session.start_at >= now()%'
    as recovery_accepts_slots_before_original,
  pg_get_functiondef(
    'public.join_booking_change_waitlist(uuid)'::regprocedure
  ) like '%session.start_at >= now()%'
    as waitlist_checks_slots_from_now,
  pg_get_functiondef(
    'private.notify_group_change_waiters(uuid)'::regprocedure
  ) not like '%between change_request.original_start_at%'
    as freed_slot_notifications_start_from_now;
