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
3. Praktisch bestaetigt: Nach `Cambiar` verschwindet die urspruengliche Buchung nur beim
   betroffenen Datum; die dauerhafte Einschreibung bleibt erhalten und die angenommene
   Ersatzbuchung erscheint beim richtigen konkreten Termin.

Neu vorbereitet:

- Kombinierte Filter in `Clases`: Kurs, Typ, Level und bei Gruppen der Wochentag.
- Ein company-weites Angebot `Entrenamiento individual` statt einzelner Kursdefinitionen pro
  Individualtermin.
- Detailansicht mit allen terminierten Individual-Sessions der kommenden vier Wochen sowie Kunde
  und Trainer.

Die Migrationen `20260825_dated_group_course_occupancy.sql` bis
`20260829_own_master_data.sql` wurden gegen die verlinkte Remote-Datenbank ausgefuehrt
und mit den separaten Verification-SQLs bestaetigt.

Praktisch bestaetigt sind die datumsbezogene Gruppenanzeige, die kombinierten Clases-Filter
und der Individual-Einstieg mit den konkreten Sessions der kommenden vier Wochen.

Die Suche in `Clases` beruecksichtigt jetzt Kurs-, Kunden- und Trainernamen. Bei Gruppenkursen
bleiben alle Kurskarten sichtbar, in deren kommenden konkreten Terminen der Kunde bestaetigt
gebucht ist. Dadurch koennen bei mehreren Trainingstagen mehrere Treffer gleichzeitig erscheinen;
geoeffnet wird ein Kurs erst nach dem Antippen seiner Karte. Bei Individualterminen werden Kunde
und Trainer aus den konkreten Sessions der kommenden vier Wochen durchsucht. Die Migration
`20260830_group_course_customer_search.sql` wurde remote ausgefuehrt und separat verifiziert.
Beim manuellen Oeffnen des Individualangebots wird der aktive Suchbegriff an die Detailseite
uebergeben und filtert dort die Sessions nach Kunde oder Trainer. Die Kartenfilterung ohne
automatisches Oeffnen sowie die uebernommene Individualsuche wurden praktisch bestaetigt.

Fuer Benutzer-Profilfotos sind Bildauswahl, runder Ausschnitt, Verschieben/Zoomen, Upload
sowie die Anzeige vor dem Teilnehmernamen auf einem echten iOS- und Android-Geraet zu testen.

Fuer die eigenen Stammdaten in `Mi perfil` sind Name und Telefonnummer praktisch zu speichern
und nach einem erneuten Login zu kontrollieren; die Anmelde-E-Mail bleibt vorerst
schreibgeschuetzt.
