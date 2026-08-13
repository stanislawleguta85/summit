-- Nur lesen: prueft die Funktionen und Rechte fuer die Bearbeitung unbelegter Kurse.

select
  to_regprocedure('public.get_course_editability(uuid)') is not null
    as course_editability_function_exists,
  to_regprocedure(
    'public.update_unoccupied_course(uuid,text,text,text,uuid,text,text[],time without time zone,time without time zone,timestamp with time zone,timestamp with time zone,integer,text,text,boolean,boolean,boolean)'
  ) is not null as unoccupied_course_update_function_exists,
  has_function_privilege(
    'authenticated',
    'public.get_course_editability(uuid)',
    'EXECUTE'
  ) as authenticated_can_check_course_editability,
  has_function_privilege(
    'authenticated',
    'public.update_unoccupied_course(uuid,text,text,text,uuid,text,text[],time without time zone,time without time zone,timestamp with time zone,timestamp with time zone,integer,text,text,boolean,boolean,boolean)',
    'EXECUTE'
  ) as authenticated_can_update_unoccupied_course;
