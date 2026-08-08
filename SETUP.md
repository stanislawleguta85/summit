# Summit – Supabase-Einrichtung

## 1. App-Konfiguration

Die Datei `.env.local` muss diese beiden öffentlichen Werte aus dem Supabase Dashboard enthalten:

```env
EXPO_PUBLIC_SUPABASE_URL=https://DEIN-PROJEKT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=DEIN-ANON-KEY
```

Der `service_role`-Key darf niemals in die App oder in eine `EXPO_PUBLIC_`-Variable eingetragen
werden.

## 2. Datenbankschema anwenden

1. Im Supabase Dashboard **SQL Editor** öffnen.
2. Eine neue Query erstellen.
3. Den vollständigen Inhalt aus `DATABASE_SCHEMA.sql` einfügen.
4. **Run** ausführen.

Das Skript kann auch auf der bestehenden Datenbank ausgeführt werden. Vorhandene Tabellen, die
Filiale „Coralles de Buelna“ und bestehende Profile werden nicht gelöscht.

Für eine bereits eingerichtete Datenbank kann alternativ nur die gezielte Migration
`supabase/migrations/20260802_owner_course_management.sql` im SQL Editor ausgeführt werden. Sie
ergänzt die Kursfelder und die geschützte Funktion `create_course`, ohne bestehende Kurse zu
löschen. Erst danach kann der Owner Kurse aus der App direkt in Supabase speichern.

Die Migration `supabase/migrations/20260802_registration_phone_number.sql` ergänzt das Feld
`phone_number` und macht es für neue Registrierungen verpflichtend. Vorhandene Profile bleiben
unverändert und dürfen weiterhin keine Telefonnummer enthalten.

Die Migration `supabase/migrations/20260802_personal_training_workflow.sql` aktiviert den Ablauf
für individuelle Trainings: Trainerzuweisung, Kundenanfragen, Terminvorschläge, verbindliche
Mehrfachbuchungen, Sessions, Bookings und In-App-Benachrichtigungen. Sie wird nach dem
Basisschema und der Kursmigration ausgeführt.

Empfohlene Reihenfolge für eine bereits bestehende Datenbank:

1. `supabase/migrations/20260802_registration_phone_number.sql` (falls noch nicht ausgeführt)
2. `supabase/migrations/20260802_owner_course_management.sql`
3. `supabase/migrations/20260802_import_et_courses.sql` ausführen; die importierten Kurse werden
   der bereits freigegebenen Ownerin Esther als Trainerin zugewiesen
4. `supabase/migrations/20260803_role_based_access_control.sql`
5. `supabase/migrations/20260802_personal_training_workflow.sql`
6. `supabase/migrations/20260802_course_client_management.sql`
7. `supabase/migrations/20260802_customer_category_levels.sql`
8. `supabase/migrations/20260803_member_permissions.sql`
9. `supabase/migrations/20260803_course_permissions.sql`
10. `supabase/migrations/20260803_course_client_result_type_fix.sql` (nur bei bereits ausgeführtem
    Schritt 9 erforderlich; bei neuen Installationen ist die Korrektur dort bereits enthalten)
11. `supabase/migrations/20260803_client_level_permissions.sql`
12. `supabase/migrations/20260803_personal_training_permissions.sql`
13. `supabase/migrations/20260803_client_permission_resolution.sql`
14. `supabase/migrations/20260803_unlimited_personal_training_proposals.sql`
15. `supabase/migrations/20260804_personal_training_transfers.sql`
16. `supabase/migrations/20260805_admin_staff_creation.sql`
17. `supabase/migrations/20260806_booking_changes.sql`
18. `supabase/migrations/20260807_booking_change_policy_execute.sql`
19. `supabase/migrations/20260808_parallel_personal_training_requests.sql`
20. `supabase/migrations/20260809_lock_processed_replacement_actions.sql`
21. `supabase/migrations/20260810_booking_change_audit.sql`
22. `supabase/migrations/20260811_group_alternative_trainer_names.sql`
23. `supabase/migrations/20260812_edit_unoccupied_courses.sql`
24. `supabase/migrations/20260813_admin_customer_creation.sql`
25. `supabase/migrations/20260814_customer_trainer_selection.sql`
26. `supabase/migrations/20260815_internal_customer_levels.sql`
27. `supabase/migrations/20260816_customer_training_contracts.sql`
28. `supabase/migrations/20260817_customer_group_self_booking.sql`
29. `supabase/migrations/20260818_customer_configuration.sql`
30. `supabase/migrations/20260819_customer_configuration_result_types.sql`
31. `supabase/migrations/20260820_save_complete_customer_configuration.sql`
32. `supabase/migrations/20260821_group_recovery_from_now.sql`
33. `supabase/migrations/20260822_reconcile_group_waitlist_notifications.sql`
34. `supabase/migrations/20260823_cancel_one_time_enrollment_with_booking.sql`
35. `supabase/migrations/20260824_sync_one_time_enrollments_with_bookings.sql`
36. `supabase/migrations/20260825_dated_group_course_occupancy.sql`
37. `supabase/migrations/20260826_personal_training_services.sql`
38. `supabase/migrations/20260827_personal_training_service_policy_execute.sql`
39. `supabase/migrations/20260828_customer_profile_photos.sql`
40. `supabase/migrations/20260829_own_master_data.sql`

Bei einer neuen Datenbank ersetzt `DATABASE_SCHEMA.sql` die ersten beiden Schritte; anschließend
werden der ET-Import aus Schritt 3, das Rollen- und Berechtigungsfundament aus Schritt 4 und
anschließend die übrigen Migrationen ausgeführt. Die Personal-Training-Migration benötigt die
kompatible Funktion `private.has_role` aus Schritt 4 bereits.

Die RBAC-Migration aus Schritt 4 ist additiv: Sie erstellt `roles`, `permissions`,
`role_permissions` und die normalisierte Zuordnung `user_roles`. Bestehende Hauptrollen aus
`user_profiles.role` werden kopiert, aber noch nicht entfernt. Rechte verwenden die Scopes `all`,
`assigned`, `own` und `eligible`. In dieser ersten Etappe werden bestehende Fachregeln noch nicht
auf Berechtigungen umgestellt; das geschieht anschließend je Funktionsbereich.

Die Migration aus Schritt 8 stellt als ersten Funktionsbereich die Mitgliederanzeige und
Registrierungsfreigabe auf `members.read` und `members.approve` um. Sie muss nach der
Personal-Training-Migration ausgeführt werden, weil diese zuvor die Profil-Policy definiert.

Die Migration aus Schritt 9 stellt Kursansicht, Kurserstellung, Trainerzuweisung,
Teilnehmerverwaltung und die Enrollment-Ansicht auf die Kursberechtigungen und ihre Scopes um.

Die Migration aus Schritt 11 stellt Trainerzuweisung, Kundenansicht und Kundenlevel auf
`clients.read`, `clients.assign_trainer` und `clients.set_level` mit `all`/`assigned` um.

Die Migration aus Schritt 12 stellt den Personal-Training-Workflow und seine Lese-Policies auf
`training_requests`, `sessions`, `bookings` und `notifications` mit `all`/`assigned`/`own` um.

Die Migration aus Schritt 13 stellt der App die effektiven Berechtigungen ueber den geschuetzten
RPC `get_user_permissions` bereit. Eigene Rechte duerfen selbst gelesen werden; fremde Rechte nur
innerhalb derselben Filiale und mit `roles.read:all` (fuer die Entwickler-Vorschau).

Die Migration aus Schritt 14 entfernt das Vier-Wochen-Fenster und die Obergrenze fuer gesendete
beziehungsweise bestaetigte Personal-Training-Termine. Termine muessen weiterhin in der Zukunft
liegen, duerfen sich nicht ueberschneiden und muessen zwischen 30 Minuten und 4 Stunden dauern.

Die Migration aus Schritt 23 erlaubt Ownern, vollstaendig unbelegte Gruppenkurse zu bearbeiten
und zwischen `Activo` und `Borrador` zu wechseln. Sobald eine Einschreibung oder Sitzungsbuchung
existiert oder der Kurs bereits Teil eines Wechselvorgangs war, bleibt die Bearbeitung
serverseitig gesperrt.

Die Migration aus Schritt 24 erlaubt Ownern und Trainern, freigegebene Kundenkonten anzulegen.
Nur Owner duerfen weiterhin neue Trainerkonten anlegen.

Die Migration aus Schritt 25 stellt beim Anlegen eines Kunden alle freigegebenen Trainer der
Filiale zur Auswahl. Beim anlegenden Trainer wird er selbst vorausgewaehlt, die Auswahl kann aber
vor dem Speichern geaendert werden. Danach muss die Edge Function `create-staff-user` erneut
bereitgestellt werden.

Die Migration aus Schritt 26 behandelt Kundenlevel als interne Information. Kunden erhalten keine
Level-Benachrichtigung und sehen ihre Einstufung nicht mehr. Bei einer Levelaenderung werden alte
zukuenftige Kursbuchungen und die bisherige Kurseinschreibung beendet; vergangene Termine bleiben
als Historie erhalten.

Die Migration aus Schritt 27 speichert das vertragliche Trainingsmodell eines Kunden. Beim
Gruppenmodell werden zusaetzlich ein bis sieben gebuchte Wochentage erfasst. Beim
Individualmodell bleibt dieser Wert leer; Individualtrainings zaehlen nicht zum
Gruppen-Wochenkontingent. Die Werte werden bereits beim Anlegen des Kunden gespeichert. Eine
automatische Buchungsbegrenzung wird erst ergaenzt, nachdem die noch offenen Vertragsregeln
fachlich geklaert wurden. Danach muss die Edge Function `create-staff-user` erneut bereitgestellt
werden.

Die Migration aus Schritt 28 erlaubt Kunden mit Gruppenvertrag, sich selbst in passende
veroeffentlichte Gruppenkurse einzubuchen. Bestaetigte Kursplaetze werden pro Kalenderwoche von
Montag bis Sonntag gezaehlt und duerfen die vertragliche Zahl nicht ueberschreiten. Ein
wiederkehrender Kurs verbraucht pro eingetragenem Wochentag eine Einheit; ein einmaliger Kurs
verbraucht eine Einheit in seiner Kalenderwoche. Wartelistenplaetze werden erst bei ihrer
Bestaetigung auf das Kontingent angerechnet. Dieselbe serverseitige Schutzpruefung gilt auch bei
einer Kurszuordnung durch Trainer oder Owner. Trainer koennen den Vertrag ihrer zugewiesenen
Kunden konfigurieren; bestehende Vertragsmodelle koennen bis zur fachlichen Entscheidung nicht
zwischen Gruppe und Individual gewechselt werden.

Die Migration aus Schritt 29 stellt Ownern und zugewiesenen Trainern eine gemeinsame
Kundenkonfiguration bereit. Sie fuehrt Stammdaten, Anmelde-E-Mail, Trainerzuordnung,
Vertragsmodell, Wochenkontingent und internes ET-Level auf einer Detailseite zusammen. Name,
Nachname und Telefonnummer koennen innerhalb des jeweiligen Berechtigungsumfangs bearbeitet
werden. Die Anmelde-E-Mail bleibt dort schreibgeschuetzt, weil ihre Aenderung zugleich das
Supabase-Login betrifft.

Die Migration aus Schritt 30 korrigiert die exakten Rueckgabetypen der Kundenkonfiguration fuer
bestehende Datenbanken, in denen einzelne Stammdatenfelder noch als `varchar` statt `text`
angelegt sind. Ohne die expliziten Typumwandlungen lehnt PostgreSQL die Abfrage trotz inhaltlich
kompatibler Werte ab.

Die Migration aus Schritt 31 buendelt Stammdaten, Trainerzuordnung, Vertrag und internes ET-Level
in einem atomaren Speichervorgang. Die Kundendetailseite zeigt deshalb nur noch einen Button
`Guardar cambios` am Seitenende. Schlaegt ein Bereich fehl, werden auch die anderen Aenderungen
nicht teilweise gespeichert.

Die Migration aus Schritt 32 sucht Gruppenersatztermine ab dem aktuellen Zeitpunkt bis zum
bestehenden Ablaufdatum. Damit kann auch ein noch bevorstehender freier Kurs vor dem
urspruenglichen Termin gewaehlt werden. Dieselbe Zeitgrenze gilt fuer Anzeige, verbindliche
Buchung, Wartelistenpruefung und Benachrichtigung bei einem frei werdenden Platz.

Die Migration aus Schritt 33 gleicht bereits wartende Gruppenwechsel mit inzwischen freien
kompatiblen Plaetzen ab und erzeugt gegebenenfalls die zuvor verpasste In-App-Benachrichtigung
nachtraeglich. Die Kunden-Startseite zeigt Benachrichtigungen ueber eine Glocke mit ungelesenem
Zaehler an; ein Platzhinweis fuehrt direkt zum passenden Cambio. Eine Betriebssystem-Pushnachricht
bei geschlossener App ist davon getrennt und weiterhin noch nicht eingerichtet.

Die Migration aus Schritt 34 beendet bei der Stornierung eines einmaligen Gruppentermins auch
die zugehoerige Kurseinschreibung. Dadurch werden der Platz und die Teilnehmerliste sofort
korrekt aktualisiert. Bereits vorhandene widerspruechliche Datensaetze werden mitbereinigt;
wiederkehrende Kurse bleiben davon unberuehrt.

Die Migration aus Schritt 35 erweitert diese Synchronisierung in beide Richtungen: Eine
bestaetigte Buchung eines einmaligen Gruppenkurses aktiviert auch dessen Kurseinschreibung.
Damit erscheinen angenommene Gruppenersatztermine unmittelbar mit korrekter Belegung und
Teilnehmerliste in `Clases`. Bereits bestaetigte Ersatzbuchungen werden nachtraeglich repariert.

Die Migration aus Schritt 36 stellt Trainern und Ownern die konkreten Gruppensitzungen der
kommenden vier Wochen mit ihrer tatsaechlichen Buchungsbelegung bereit. Die Teilnehmerabfrage
arbeitet ebenfalls pro Sitzung statt mit der dauerhaften Kurseinschreibung. Dadurch werden
freigegebene und als Ersatz gebuchte Plaetze bei Wochenkursen am richtigen Datum angezeigt.

Die Migration aus Schritt 37 legt pro Filiale genau ein Individualangebot an und verknuepft
damit bestehende sowie neue Individualanfragen und deren konkrete Sessions. `Clases` zeigt
dieses Angebot nur einmal; beim Oeffnen erscheinen die terminierten Individualtrainings der
kommenden vier Wochen mit Kunde und Trainer. Gruppen bleiben als Kursdefinitionen in `courses`.

Die Migration aus Schritt 38 erlaubt angemeldeten Benutzern die Ausfuehrung der geschuetzten
RLS-Hilfsfunktion fuer das Individualangebot. Anonyme Benutzer behalten keinen Zugriff.

Die Migration aus Schritt 39 legt einen privaten Storage-Bucket fuer Profilfotos an. Freigegebene
Benutzer koennen ausschliesslich ihr eigenes Foto hochladen und den eigenen Avatarpfad aktualisieren;
freigegebene Benutzer derselben Filiale koennen die Bilder ueber zeitlich begrenzte URLs sehen.

Die Migration aus Schritt 40 erlaubt freigegebenen Benutzern, den eigenen Vor- und Nachnamen
sowie die eigene Telefonnummer zu aktualisieren. Die Anmelde-E-Mail bleibt davon unberuehrt.

Der ET-Import übernimmt 37 Gruppenkurse aus der Excel-Tabelle. Die neun bisherigen
Individual-Zeiten werden nicht importiert, weil individuelle Trainings über den Anfrage- und
Vorschlagsprozess gebucht werden. Das Importscript kann erneut ausgeführt werden; anhand der
stabilen Excel-UUIDs werden die Kurszeilen aktualisiert, statt doppelt angelegt zu werden.

## 3. Ersten Owner einrichten

Zuerst über die App ein normales Konto registrieren. Anschließend einmalig im SQL Editor ausführen
und die E-Mail ersetzen:

```sql
update public.user_profiles
set
  role = 'owner',
  status = 'approved',
  approved_at = now()
where user_id = (
  select id
  from auth.users
  where email = 'DEINE-EMAIL'
);
```

Danach in der App abmelden und erneut anmelden. Der Tab **Admin** ist jetzt sichtbar.

## Bestehender Auth-Benutzer ohne Profil

Falls ein Benutzer vor der Installation des neuen Triggers registriert wurde und noch kein Profil
hat, kann das Profil einmalig so ergänzt werden:

```sql
insert into public.user_profiles (
  user_id,
  company_id,
  first_name,
  last_name,
  role,
  status
)
select
  auth_user.id,
  company.id,
  coalesce(auth_user.raw_user_meta_data ->> 'first_name', ''),
  coalesce(auth_user.raw_user_meta_data ->> 'last_name', ''),
  'customer',
  'pending'
from auth.users as auth_user
cross join lateral (
  select id
  from public.companies
  order by created_at
  limit 1
) as company
where auth_user.email = 'DEINE-EMAIL'
  and not exists (
    select 1
    from public.user_profiles
    where user_id = auth_user.id
  );
```

Anschließend kann dieses Profil mit dem vorherigen Owner-SQL freigegeben werden.

## Benutzerablauf

1. Der Benutzer wählt bei der Registrierung eine Filiale.
2. Supabase Auth erstellt das Konto.
3. Ein Datenbank-Trigger erstellt sicher ein Profil als `customer` mit Status `pending`.
4. Der Benutzer bestätigt gegebenenfalls seine E-Mail und meldet sich an.
5. Ein genehmigter Owner sieht den Benutzer im Adminbereich.
6. Der Owner genehmigt oder lehnt das Konto über die geschützte Funktion `review_user` ab.
7. Nur Benutzer mit Status `approved` erhalten Zugriff auf den Appbereich.

## Entwicklung starten

```powershell
npm.cmd install
npm.cmd start
```

Computer und iPhone müssen für die normale LAN-Verbindung im selben WLAN sein. Alternativ:

```powershell
npx.cmd expo start --tunnel
```
