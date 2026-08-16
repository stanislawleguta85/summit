# Completed Tests

Stand: 3. August 2026  
Projekt: Summit

Dieses Dokument protokolliert die bisher gemeinsam durchgefuehrten manuellen und technischen Tests. Bei manuellen Tests bedeutet **bestaetigt**, dass das Verhalten in der App beobachtet wurde. **Technisch verifiziert** bezeichnet eine erfolgreiche SQL-, Berechtigungs- oder Build-Pruefung. Wenn ein Test einen Fehler aufgedeckt hat, ist das Ergebnis entsprechend gekennzeichnet.

## Rollen und Berechtigungen

1. **RLS-Policies fuer Personal Training ausgelesen**  
   Ergebnis: Technisch verifiziert. Die SELECT-Policies fuer `bookings`, `course_sessions`, `notifications`, `personal_training_proposals` und `personal_training_requests` waren vorhanden.

2. **Effektive Berechtigungen von Santiago geprueft**  
   Ergebnis: Technisch verifiziert. Santiago besitzt die Rollen `owner` und `trainer` und darf alle bzw. zugewiesene Trainingsanfragen lesen und zugewiesene Anfragen beantworten.

3. **Effektive Berechtigungen von Stanislaw geprueft**  
   Ergebnis: Technisch verifiziert. Stanislaw besitzt die Rolle `customer` und darf eigene Trainingsanfragen lesen, erstellen und bestaetigen sowie eigene Benachrichtigungen lesen und aktualisieren.

4. **Berechtigungs-RPC `get_user_permissions` geprueft**  
   Ergebnis: Technisch verifiziert. Die Funktion laeuft als `SECURITY DEFINER` und darf von `authenticated` ausgefuehrt werden.

5. **Profil- und Berechtigungsauflösung nach RLS-Fehler getestet**  
   Ergebnis: Der Test deckte zunaechst `permission denied for user_profiles` auf. Nach der Korrektur konnte das Profil geladen und der Mitarbeiter angelegt werden.

6. **Kontowechsel zwischen Kunde, Trainer und Owner getestet**  
   Ergebnis: Bestaetigt. Nach korrektem Abmelden konnten die verschiedenen Testkonten ohne Weitergabe der vorherigen Sitzung verwendet werden.

## Individuelles Training

7. **Individuelle Trainingsanfrage als Stanislaw erstellt**  
   Ergebnis: Bestaetigt. Der Kunde konnte die Anfrage erfolgreich absenden.

8. **Individuelle Trainingsanfrage als Santiago geoeffnet**  
   Ergebnis: Bestaetigt. Santiago konnte die Anfrage unter `Solicitudes` finden und oeffnen.

9. **Zeitvorschlaege des Trainers eingegeben**  
   Ergebnis: Durchgefuehrt. Dabei wurden UX-Probleme mit Datum, Zeitraedern, Zahlentastatur und dem grau wirkenden Button `Anadir horario` erkannt und anschliessend ueberarbeitet.

10. **Direkte Eingabe in die Zeitraeder getestet**  
    Ergebnis: Bestaetigt. Nach der Anpassung ueberlagerte die Zahlentastatur die Raeder nicht mehr; der Nutzer bestaetigte das Verhalten mit „top“.

11. **Trainer-Konflikt bei der finalen Vorschlagsbestaetigung getestet**  
    Ergebnis: Der Test erkannte den Konflikt korrekt, aber zu spaet beim Absenden aller Vorschlaege. Daraufhin wurde die Verfuegbarkeitspruefung in den Schritt `Anadir horario` vorgezogen.

12. **Vier-Wochen-Limit fuer normale individuelle Trainingsvorschlaege geprueft**  
    Ergebnis: Technisch verifiziert. Das feste Vier-Wochen-Limit wurde aus der Vorschlagsfunktion entfernt.

13. **Anzahl der Trainer-Vorschlaege geprueft**  
    Ergebnis: Technisch verifiziert. Das Vorschlagslimit wurde entfernt; der Trainer kann selbst entscheiden, wie viele Termine angeboten werden.

14. **Anzahl der vom Kunden waehlbaren Vorschlaege geprueft**  
    Ergebnis: Technisch verifiziert. Das bisherige Auswahl-Limit wurde entfernt.

15. **Parallele normale und Ersatz-Trainingsanfragen geprueft**  
    Ergebnis: Technisch verifiziert. Eine offene normale Anfrage blockiert eine separate Ersatzanfrage fuer einen bestehenden individuellen Termin nicht mehr.

16. **Darstellung offener individueller Trainingsvorschlaege beim Kunden geprueft**  
    Ergebnis: Durchgefuehrt. Die fehlende Kennzeichnung wurde erkannt; normale Anfragen werden nun als individuelles Training und Ersatzanfragen als `Cambio de cita` mit Originaltermin dargestellt.

## Weiterleitung zwischen Trainern

17. **Datenbankstruktur fuer Trainer-Weiterleitungen geprueft**  
    Ergebnis: Technisch verifiziert. Tabelle, Berechtigung, RLS-Policy und alle RPCs fuer Kandidaten, eingehende Transfers, Anfrage, Antwort und Abbruch waren vorhanden und fuer `authenticated` ausfuehrbar.

18. **Blockierung von Vorschlaegen waehrend eines offenen Transfers geprueft**  
    Ergebnis: Technisch verifiziert. Ein ausstehender Transfer blockiert das gleichzeitige Erstellen von Vorschlaegen.

19. **Weiterleitung von Ersatzanfragen zugelassen**  
    Ergebnis: Technisch verifiziert. Auch eine Anfrage zur Verschiebung eines individuellen Trainings kann an einen anderen Trainer weitergeleitet werden.

20. **Bearbeitete Ersatzanfragen gegen weitere Aktionen gesperrt**  
    Ergebnis: Technisch verifiziert. Sobald Vorschlaege an den Kunden gesendet wurden, kann die Anfrage nicht mehr weitergeleitet oder mit `No hay alternativas` abgelehnt werden.

21. **Trainer-Uebersicht fuer Transfers und Bearbeitungsstatus getestet**  
    Ergebnis: Durchgefuehrt. Die Filter wurden auf `Por gestionar`, `Enviadas`, `Traspasos` und zuletzt `Todos` angepasst; standardmaessig werden offene Vorgaenge angezeigt.

## Mitarbeiterkonten

22. **Admin-Berechtigung zum Erstellen von Mitarbeitern geprueft**  
    Ergebnis: Technisch verifiziert. Die Berechtigung `members.create`, die Owner-Zuweisung und die geschuetzte Service-Role-Abschlussfunktion waren korrekt eingerichtet.

23. **Trainer-Testkonto durch den Admin angelegt**  
    Ergebnis: Bestaetigt. Das zweite Trainerkonto wurde erfolgreich ohne vorherige Selbstregistrierung des Trainers erstellt.

24. **Anmeldung mit dem neu angelegten Trainerkonto getestet**  
    Ergebnis: Bestaetigt. Die Anmeldung mit E-Mail-Adresse und Initialpasswort funktionierte.

25. **Initialen Passwortwechsel getestet**  
    Ergebnis: Bestaetigt. Das neu angelegte Konto konnte den vorgesehenen ersten Passwortwechsel abschliessen.

## Terminverschiebungen

26. **Berechtigung zum Erstellen eigener Aenderungsanfragen geprueft**  
    Ergebnis: Technisch verifiziert. Kunden duerfen eigene Aenderungsanfragen erstellen; die zugehoerige Lesepolicy und deren Hilfsfunktion sind ausfuehrbar.

27. **Vier-Stunden-Grenze fuer `Cambiar` in der App verwendet**  
    Ergebnis: Durchgefuehrt. Der Wechselprozess wurde mit einem ausreichend weit in der Zukunft liegenden Termin gestartet und akzeptiert.

28. **Pflichtfeld fuer den Aenderungsgrund getestet**  
    Ergebnis: Durchgefuehrt. Ein Grund wurde eingegeben und die Aenderungsanfrage anschliessend erstellt.

29. **Gruppentermin durch `Cambiar` freigegeben**  
    Ergebnis: Bestaetigt. Nach dem Wechselantrag verschwand der urspruengliche Gruppentermin sofort aus dem Kundenkalender.

30. **Zwischenstatus nach Freigabe des Gruppentermins geprueft**  
    Ergebnis: Der Test zeigte zunaechst faelschlich `Perdido`. Die Anzeige wurde auf `Pendiente de recuperar` bis zum Ablauf der Vier-Wochen-Frist korrigiert.

31. **Anzeige der Gruppenkurs-Alternativen getestet**  
    Ergebnis: Bestaetigt. Der Test wurde bis zur Liste der verfuegbaren Alternativtermine durchgefuehrt; der Nutzer bestaetigte „Alles korrekt“.

32. **Filterregeln der Gruppenkurs-Alternativen geprueft**  
    Ergebnis: Im erfolgreichen manuellen Test wurden passende Alternativen angezeigt. Technisch wird nach gleicher Kategorie, gleichem Level, exakt gleicher Dauer, dem Zeitfenster bis vier Wochen und freien Plaetzen gefiltert; der Trainer darf abweichen.

33. **Trainername bei Gruppenkurs-Alternativen eingebunden**  
    Ergebnis: Implementiert und durch die erfolgreiche Alternativanzeige im aktuellen Ablauf abgedeckt.

34. **Auswahlzustand der Alternativtermine geprueft**  
    Ergebnis: Der Test deckte ein missverstaendliches gelbes Check-Symbol auf. Die Darstellung wurde in eine nicht vorausgewaehlt wirkende Aktion `Elegir` geaendert.

35. **Originaltermin in Kunden- und Traineransichten geprueft**  
    Ergebnis: Durchgefuehrt. Fehlende Angaben wurden erkannt; der zu verschiebende Originaltermin wird nun bei Ersatzvorschlaegen und in der Trainer-Uebersicht angezeigt.

36. **Statusbezeichnungen fuer Aenderungsanfragen geprueft**  
    Ergebnis: Durchgefuehrt. Uneindeutige Statusangaben wurden auf `Cambio pendiente`, `Cambio enviado` und `Cambio rechazado` praezisiert.

37. **Ablehnungs-Audit fuer individuelle Terminverschiebungen geprueft**  
    Ergebnis: Technisch verifiziert. Ablehnender Benutzer, Ablehnungszeitpunkt sowie Original- und verantwortlicher Trainer werden protokolliert und koennen vom Trainer gelesen werden.

38. **Finalisierte Aenderungsanfragen im Trainerbereich getestet**  
    Ergebnis: Bestaetigt. Trainer Dos konnte unter den finalisierten Vorgaengen eine abgelehnte individuelle Aenderungsanfrage sehen; die anfangs unklare Beteiligung wurde durch die erweiterte Audit-Anzeige praezisiert.

39. **Wartelisten-Infrastruktur bei frei werdender Buchung geprueft**  
    Ergebnis: Technisch verifiziert. Der Datenbank-Trigger fuer Benachrichtigungen bei einer von `confirmed` auf `cancelled` wechselnden Buchung ist installiert. Der vollstaendige manuelle Wartelistenablauf wurde noch nicht durchgefuehrt.

40. **Jahreswechsel der Vier-Wochen-Frist technisch geprueft**  
    Ergebnis: Die Frist wird als `original_start_at + interval '4 weeks'` berechnet und funktioniert dadurch auch ueber Monats- und Jahresgrenzen hinweg.

41. **Jahr in der angezeigten Ablauffrist ergaenzt**  
    Ergebnis: Implementiert. Die Detailansicht und `Mis cambios` verwenden nun ein spanisches Datum inklusive Jahr, zum Beispiel `domingo, 17 de enero de 2027`.

## Technische Abschlusspruefungen

42. **Gesamtpruefung der Migrationen fuer Aenderungsanfragen ausgefuehrt**  
    Ergebnis: Technisch verifiziert. Tabelle, Verknuepfung zur Ersatzanfrage, Kalenderfunktion, Aenderungsfunktion, Alternativen, Gruppenwiederherstellung, Warteliste, Ablehnung, RLS-Policy und Ausfuehrungsrechte waren vorhanden.

43. **Gesamtpruefung der nachtraeglichen Schutzmechanismen ausgefuehrt**  
    Ergebnis: Technisch verifiziert. Parallele Anfragen, Aktionssperre nach Bearbeitung, Ablehnungsakteur, Audit-Trigger, Trainer-Leserecht und Policy-Hilfsfunktion lieferten jeweils `true`.

44. **TypeScript-Pruefung nach der Jahresanzeige ausgefuehrt**  
    Ergebnis: Bestanden. `npx tsc --noEmit` wurde ohne Fehler abgeschlossen.

45. **TypeScript-Pruefung nach der Kursbearbeitung ausgefuehrt**  
    Ergebnis: Bestanden. Das vorausgefuellte Bearbeitungsformular, die Edit-Aktion und die neuen RPC-Aufrufe wurden mit `npx tsc --noEmit` ohne Fehler geprueft.

46. **Migration fuer die Bearbeitung unbelegter Kurse geprueft**  
    Ergebnis: Technisch verifiziert. Editierbarkeitsfunktion, Update-Funktion und beide Ausfuehrungsrechte fuer `authenticated` lieferten jeweils `true`.

47. **TypeScript-Pruefung nach Erweiterung der Kontoerstellung ausgefuehrt**  
    Ergebnis: Bestanden. Die gemeinsame Kontoerstellungsseite fuer Owner und Trainer sowie die Rollenauswahl wurden mit `npx tsc --noEmit` ohne Fehler geprueft.

48. **Erweiterte Edge Function fuer die Kontoerstellung bereitgestellt**  
    Ergebnis: Technisch bestaetigt. `create-staff-user` wurde erfolgreich in das verknuepfte Supabase-Projekt hochgeladen.

49. **TypeScript und Edge Function nach Einbau der Trainerauswahl geprueft**  
    Ergebnis: Bestanden. Die verpflichtende Trainerauswahl, Vorauswahl des angemeldeten Trainers und der aktualisierte Funktionsaufruf wurden ohne TypeScript-Fehler gebaut; die Edge Function wurde anschliessend erfolgreich neu bereitgestellt.

50. **Kundenansichten ohne interne Levelangabe geprueft**  
    Ergebnis: Technisch bestanden. Levelbezeichnungen und levelbezogene Leertexte wurden aus Kundenkursen und Kundenkalender entfernt; `npx tsc --noEmit` wurde ohne Fehler abgeschlossen.

51. **TypeScript-Pruefung nach Erfassung des Kundenvertrags ausgefuehrt**  
    Ergebnis: Bestanden. Trainingsmodell und Auswahl von ein bis sieben Gruppen-Wochentagen im Kundenformular wurden mit `npx tsc --noEmit` ohne Fehler geprueft.

52. **Edge Function mit Vertragsdaten bereitgestellt**  
    Ergebnis: Technisch bestaetigt. `create-staff-user` wurde mit serverseitiger Pruefung des Trainingsmodells und der Gruppen-Wochentage erfolgreich neu bereitgestellt.

53. **TypeScript-Pruefung nach Einbau der Gruppen-Selbstbuchung ausgefuehrt**  
    Ergebnis: Bestanden. Vertragsverwaltung fuer zugewiesene Kunden, Kundenanzeige des Gruppenplans, Buchungsaktion sowie Buchungs- und Wartelistenstatus wurden mit `npx tsc --noEmit` ohne Fehler geprueft.

54. **Datenbankfunktionen fuer Gruppen-Selbstbuchung und Wochenkontingent geprueft**  
    Ergebnis: Technisch verifiziert. Selbstbuchungsfunktion, Ausfuehrungsrechte, Schutz vor anonymen Aufrufen, Kontingentfunktion, Vertragsverwaltung und der zentrale Enrollment-Trigger lieferten jeweils `true`.

55. **TypeScript-Pruefung der gemeinsamen Kundenkonfiguration ausgefuehrt**  
    Ergebnis: Bestanden. Gemeinsame Kundendetailroute, Navigation aus Admin- und Trainerliste sowie Stamm-, Vertrags- und interne Konfigurationsbereiche wurden mit `npx tsc --noEmit` ohne Fehler geprueft.

56. **Datenbankfunktionen und Rechte der Kundenkonfiguration geprueft**  
    Ergebnis: Technisch verifiziert. Konfigurationsabfrage, Stammdatenfunktion, authentifizierte Ausfuehrungsrechte, Schutz vor anonymem Lesen sowie Owner- und Trainerberechtigungen lieferten jeweils `true`.

57. **Kundenlink in der Admin-Startseitenvorschau korrigiert**  
    Ergebnis: Der alte Platzhalterdialog mit Name und Rolle wurde fuer Kunden entfernt. Kundenzeilen in `Personal y clientes` oeffnen nun dieselbe zentrale Kundendetailseite wie die vollstaendige Adminliste und der Trainer-Tab.

58. **Kundendetailseite auf einen gemeinsamen Speichervorgang umgestellt**  
    Ergebnis: Technisch bestanden. Stammdaten, Trainer, Vertrag und internes Level werden in einem Formular vorgemerkt und ueber `Guardar cambios` am Seitenende gespeichert; `npx tsc --noEmit` wurde ohne Fehler abgeschlossen.

59. **Atomare Gesamtfunktion der Kundenkonfiguration geprueft**  
    Ergebnis: Technisch verifiziert. Gesamtfunktion, Ausfuehrungsrecht fuer authentifizierte berechtigte Benutzer und Schutz vor anonymem Speichern lieferten jeweils `true`.

60. **Suchbeginn fuer Gruppenersatztermine auf den aktuellen Zeitpunkt korrigiert**  
    Ergebnis: Technisch verifiziert. Alternativanzeige, verbindliche Wiederherstellung, Wartelistenpruefung und Freiplatz-Benachrichtigung verwenden nun alle den aktuellen Zeitpunkt statt des spaeteren Originaltermins; die vier Pruefwerte lieferten jeweils `true`.

61. **In-App-Benachrichtigungszentrale fuer Kunden eingebaut**  
    Ergebnis: Technisch bestanden. Die Kunden-Startseite laedt eigene Benachrichtigungen, zeigt eine Glocke mit ungelesenem Zaehler, markiert geoeffnete Meldungen als gelesen und navigiert ueber den gespeicherten Pfad zum Cambio; `npx tsc --noEmit` wurde ohne Fehler abgeschlossen.

62. **Einmalige Kurse nach Cambio vollstaendig freigegeben**  
    Ergebnis: Technisch verifiziert. Synchronisierungsfunktion und Trigger sind aktiv; bereits stornierte einmalige Buchungen besitzen keine weiterhin aktive Kurseinschreibung mehr. Alle drei Pruefwerte lieferten `true`.

63. **Bestaetigte Ersatzbuchungen einmaliger Kurse in Clases synchronisiert**  
    Ergebnis: Technisch verifiziert. Die beidseitige Synchronisierungsfunktion und ihr Trigger sind aktiv. Jede bestaetigte einmalige Buchung besitzt eine aktive Einschreibung und reine Stornierungen besitzen keine aktive Einschreibung mehr. Alle vier Pruefwerte lieferten `true`.

64. **Datumsbezogene Clases-Oberflaeche technisch geprueft**  
    Ergebnis: Bestanden. Kurskarten verwenden die Belegung der naechsten konkreten Sitzung; die Detailseite bietet einen Datumswaehler und laedt Teilnehmer aus den Buchungen der ausgewaehlten Sitzung. `npx tsc --noEmit` wurde ohne Fehler abgeschlossen.

65. **Zehn Gruppen-Testkunden vollstaendig angelegt und verifiziert**  
    Ergebnis: Bestanden. Zehn bestaetigte Auth-Konten und freigegebene Kundenprofile wurden Santiago zugeordnet. Alle besitzen einen Gruppenvertrag ueber zwei Tage pro Woche; die ET-Level verteilen sich auf drei Bajo, drei Medio und vier Alto. Alle neun Datenbankpruefwerte lieferten `true`; die einmalige Seed-Funktion, ihr Schluessel und die temporaere Datenbankfunktion wurden wieder entfernt.

66. **Clases-Filter und gemeinsame Individualdefinition technisch geprueft**  
    Ergebnis: Bestanden. Die Clases-Oberflaeche kombiniert Kurssuche, Typ, Level und bei Gruppen den Wochentag sowie die Verfuegbarkeit des naechsten Termins. Das Individualangebot erscheint einmal und fuehrt zu einer Detailansicht der konkreten Sessions mit Kunde und Trainer. Die Kundenansicht zeigt dieselbe Angebotsdefinition ueber dem bestehenden Anfrageprozess. `npx tsc --noEmit` wurde ohne Fehler abgeschlossen.

67. **RLS-Ausfuehrungsrecht fuer das Individualangebot technisch geprueft**  
    Ergebnis: Bestanden. Der Hotfix wurde in einer zurueckgerollten Transaktion gegen die verbundene Datenbank geprueft. `authenticated` kann die Policy-Hilfsfunktion ausfuehren, waehrend `anon` keinen Zugriff besitzt; beide Pruefwerte lieferten `true`.

68. **Konkrete Gruppentermine im Trainerkalender technisch geprueft**  
    Ergebnis: Bestanden. Die Startseite verwendet nun konkrete Gruppensitzungen statt `courses.start_date`. Datum, Uhrzeit, Belegung und Teilnehmer werden pro Sitzung ausgewertet; dadurch erscheinen sowohl unbelegte als auch belegte Wochenkurse. Der Datenbankabgleich bestaetigte Santiagos ET-Termin am 10.08.2026 um 12:30 Uhr mit drei bestaetigten Buchungen. `npx tsc --noEmit` wurde ohne Fehler abgeschlossen.

69. **Benutzer-Profilfoto technisch vorbereitet und abgesichert**  
    Ergebnis: Bestanden. Der private Storage-Bucket, die Avatarspalte, die eigene Aktualisierungsfunktion sowie Lese- und Upload-Policies wurden in einer zurueckgerollten Transaktion gegen die verbundene Datenbank geprueft; alle sieben Pruefwerte lieferten `true`. Der runde Editor unterstuetzt Verschieben und Zoomen, erzeugt einen quadratischen 512-Pixel-Avatar und die Teilnehmerkarten laden Bilder ueber signierte URLs. Expo-Konfiguration und `npx tsc --noEmit` wurden ohne Fehler abgeschlossen.

70. **Eigenes Profil aus den rollenbezogenen Benutzerbereichen erreichbar**  
    Ergebnis: Technisch bestanden. Owner finden `Mi perfil` im Benutzer-/Adminbereich, Trainer ueber das Benutzersymbol im Home-Header und Kunden weiterhin ueber das Benutzersymbol ihrer Startseite. Die Profilroute liegt ausserhalb der Tabgruppe und erzeugt daher keinen zusaetzlichen Tab. `npx tsc --noEmit` wurde ohne Fehler abgeschlossen.

71. **Eigene Stammdaten in Mi perfil technisch geprueft**
    Ergebnis: Bestanden. Vorname, Nachname und Telefonnummer sind fuer den authentifizierten Benutzer bearbeitbar; die Anmelde-E-Mail wird erklaert und schreibgeschuetzt angezeigt. Die geschuetzte Aktualisierungsfunktion wurde in einer zurueckgerollten Transaktion geprueft und alle drei Rechtepruefungen lieferten `true`. Das Formular weicht der Bildschirmtastatur aus; `npx tsc --noEmit` wurde ohne Fehler abgeschlossen.

72. **Remote-Migrationen 20260827 bis 20260829 ausgefuehrt und verifiziert**
    Ergebnis: Bestanden. Die Migrationen fuer das RLS-Ausfuehrungsrecht des Individualangebots, Profilfotos und eigene Stammdaten wurden gegen die verlinkte Supabase-Remote-Datenbank ausgefuehrt. Die separaten Verification-SQLs `20260827_verify_personal_training_service_policy_execute.sql`, `20260828_verify_customer_profile_photos.sql` und `20260829_verify_own_master_data.sql` lieferten jeweils ausschliesslich `true`-Pruefwerte.

73. **Clases-Filter, konkrete Gruppenbelegung und Individualangebot praktisch getestet**
    Ergebnis: Bestanden. Als berechtigter Benutzer wurden Typ, Level, Wochentag, Verfuegbarkeit und Kurssuche einzeln sowie kombiniert geprueft. Die Detailansicht eines Gruppenkurses zeigte den richtigen konkreten Termin und die zur Belegung passende Teilnehmerzahl. `Entrenamiento individual` erschien genau einmal; die Detailansicht zeigte die terminierten Sessions der kommenden vier Wochen mit Datum, Uhrzeit, Kunde und Trainer.

74. **Kundennamensuche in Clases technisch umgesetzt und abgesichert**
    Ergebnis: Bestanden. Kurskarten sind ueber Kurs-, Kunden- und Trainernamen akzentunabhaengig filterbar. Gruppenkunden werden ausschliesslich aus bestaetigten Buchungen konkreter Termine der kommenden vier Wochen geladen; die bestehende Kartenliste wird gefiltert und kein Treffer automatisch geoeffnet. Beim manuellen Oeffnen des Individualangebots wird der aktive Suchbegriff an die Detailseite uebergeben und dort auf Kunden- und Trainernamen angewendet. Die Remote-Funktion und ihre separate Verification-SQL bestaetigten Existenz und Zugriff fuer `authenticated` sowie den fehlenden Zugriff fuer `anon` jeweils mit `true`. `npx tsc --noEmit` wurde ohne Fehler abgeschlossen.

75. **Kundensuche und uebernommener Individualfilter praktisch getestet**
    Ergebnis: Bestanden. Die Suche nach einem Kundennamen liess die passenden Karten in `Clases` sichtbar, ohne sie automatisch zu oeffnen. Nach dem manuellen Oeffnen von `Entrenamiento individual` wurde derselbe Suchbegriff uebernommen und die Detailseite zeigte ausschliesslich die passenden Sessions.

76. **Suchfelder mit Schnell-Loeschbutton praktisch getestet**
    Ergebnis: Bestanden. Die gemeinsame Suchkomponente zeigt bei vorhandener Eingabe rechts ein `X`, das den gesamten Suchbegriff mit einem Tippen entfernt, ohne die Breite des Feldes zu veraendern.

77. **Wochenkurswechsel bis zur Ersatzbuchung praktisch getestet**
    Ergebnis: Bestanden. Bei Erikas woechentlichem Gruppenkurs wurde nur die konkrete Montagssitzung freigegeben; die dauerhafte Einschreibung und die folgenden Wochen blieben erhalten. Nach dem Veroeffentlichen eines kompatiblen Dienstagkurses mit demselben Level konnte Erika den Ersatztermin waehlen. Anschliessend erschien sie beim richtigen Ersatztermin, waehrend ihr Platz im urspruenglichen Termin frei war.

## Noch nicht als vollstaendig getestet markiert

Die folgenden Punkte gehoeren bewusst nicht zu den bestandenen End-to-End-Tests:

- Keine verfuegbaren Gruppentermine innerhalb der vier Wochen
- Eintragen in die Warteliste ueber die App
- Freigabe eines Platzes und anschliessende In-App-Benachrichtigung
- Echte Push-Benachrichtigung auf einem Geraet
- Deep Link von der Push-Nachricht zum freigewordenen Kurs
- Ablauf der Vier-Wochen-Frist ohne Wiederherstellung
- Vollstaendiger Gruppenwechsel bis zur erfolgreichen Buchung des Ersatzkurses
- Bearbeitung und Statuswechsel eines unbelegten Kurses nach Ausfuehrung der Migration `20260812`
- Serverseitige Ablehnung der Bearbeitung eines inzwischen belegten Kurses
- Kundenkonto durch einen Owner erstellen und anmelden
- Kundenkonto durch einen Trainer erstellen und automatische Trainerzuordnung pruefen
- Vorauswahl des anlegenden Trainers und Wechsel auf einen anderen Trainer pruefen
- Levelwechsel pruefen: alte zukuenftige Buchungen beendet, Historie erhalten und keine Kundenbenachrichtigung
- Gruppen-Kundenkonto mit der gewaehlten Anzahl Wochentage anlegen und gespeicherten Vertrag pruefen
- Individual-Kundenkonto anlegen und pruefen, dass keine Gruppen-Wochentage gespeichert werden
- Gruppenvertrag fuer einen bestehenden Kunden in der Traineransicht konfigurieren
- Zwei Gruppenkurse bei einem Zwei-Tage-Vertrag erfolgreich selbst buchen
- Dritten Gruppenkurs derselben Kalenderwoche serverseitig ablehnen
- Wartelistenplatz pruefen: kein Verbrauch des Wochenkontingents bis zur Bestaetigung
- Kundenkonfiguration aus `Personal y clientes` als Owner oeffnen
- Dieselbe Kundenkonfiguration aus dem Tab `Clientes` als zugewiesener Trainer oeffnen
- Stamm-, Vertrags- und interne Kundendaten auf der Detailseite bearbeiten und neu laden
- Freien Gruppentermin vor dem Originaltermin nach Migration `20260821` anzeigen und buchen
- Als Kunde, Trainer und Owner jeweils das eigene Profil oeffnen; ein Profilfoto im Kreis verschieben, zoomen und speichern
- Profilfoto auf iOS und Android neu laden und vor dem Teilnehmernamen im Trainerkalender pruefen
- Eigene Stammdaten als Kunde, Trainer und Owner speichern und nach erneutem Login kontrollieren
