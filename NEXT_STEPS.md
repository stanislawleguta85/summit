# Next steps

## Stand am 05.08.2026

Die Traineransicht `Clases` fuer woechentlich geplante Gruppenkurse wurde datumsbezogen
umgesetzt.

Aktueller Stand:

- `Cambiar` storniert bei einem woechentlichen Kurs korrekt nur die konkrete Sitzung.
- Die dauerhafte Kurseinschreibung bleibt fuer die folgenden Wochen erhalten.
- Ein Ersatzplatz in einem anderen woechentlichen Kurs gilt nur fuer die konkrete Sitzung.
- Kapazitaet und Verfuegbarkeit werden anhand der konkreten `bookings` geprueft.
- `Clases` verwendet fuer die datumsbezogene Belegung konkrete `bookings` statt dauerhafter
  `course_enrollments`.

Umgesetzt:

1. Woechentliche Kurse in `Clases` mit der tatsaechlichen Belegung einer konkreten Sitzung
   anzeigen, zum Beispiel `Miercoles, 05.08.2026 - 3/6 plazas`.
2. Beim Oeffnen einer Sitzung ausschliesslich deren bestaetigte `bookings` als Teilnehmerliste
   anzeigen.
3. Technisch vorbereitet: Die praktische App-Pruefung muss noch bestaetigen, dass nach `Cambiar`
   die urspruengliche Buchung nur beim betroffenen Datum verschwindet und die angenommene
   Ersatzbuchung beim richtigen Termin erscheint.

Neu vorbereitet:

- Kombinierte Filter in `Clases`: Kurs, Typ, Level und bei Gruppen der Wochentag.
- Ein company-weites Angebot `Entrenamiento individual` statt einzelner Kursdefinitionen pro
  Individualtermin.
- Detailansicht mit allen terminierten Individual-Sessions der kommenden vier Wochen sowie Kunde
  und Trainer.

Die Migrationen `20260825_dated_group_course_occupancy.sql` und
`20260826_personal_training_services.sql` wurden ausgefuehrt. Danach muss noch der RLS-Hotfix
`20260827_personal_training_service_policy_execute.sql` ausgefuehrt werden. Anschliessend sind
die datumsbezogene Gruppenanzeige, Filter und der Individual-Einstieg praktisch zu bestaetigen.

Fuer Benutzer-Profilfotos muss danach `20260828_customer_profile_photos.sql` ausgefuehrt werden.
Anschliessend sind Bildauswahl, runder Ausschnitt, Verschieben/Zoomen, Upload sowie die Anzeige
vor dem Teilnehmernamen auf einem echten iOS- und Android-Geraet zu testen.

Fuer die eigenen Stammdaten in `Mi perfil` muss danach `20260829_own_master_data.sql`
ausgefuehrt werden. Name und Telefonnummer sind anschliessend praktisch zu speichern und nach
einem erneuten Login zu kontrollieren; die Anmelde-E-Mail bleibt vorerst schreibgeschuetzt.
