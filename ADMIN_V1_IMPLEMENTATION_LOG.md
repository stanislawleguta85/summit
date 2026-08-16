# Summit Admin V1 – Umsetzungsprotokoll

Stand: 26. Juli 2026  
Projekt: Summit (`Expo SDK 54`, React Native, Expo Router, TypeScript, Supabase)

## 1. Ausgangslage und Sicherung

Vor der Umstellung wurde der vollständige damalige Projektstand in Git gesichert.

- Snapshot-Commit: `b0229f7`
- Commit-Nachricht: `snapshot: before admin v1 redesign`
- Sicherungs-Branch: `backup/pre-admin-redesign-2026-07-26`
- Sicherungs-Tag: `backup/pre-admin-redesign-2026-07-26`
- Ausgangsbasis auf GitHub: `28230fc`

Die Admin-V1-Änderungen befinden sich derzeit als noch nicht eingecheckte Änderungen auf
`master`. Der Sicherungs-Branch und der Tag zeigen weiterhin unverändert auf den Stand vor
der Umstellung.

Vor einem späteren Wechsel auf den Sicherungs-Branch müssen die aktuellen V1-Änderungen
zuerst eingecheckt oder anderweitig gesichert werden.

## 2. Designgrundlage

Als Grundlage wurde die externe Spezifikation
`C:\Users\Scobo\Downloads\summit_admin_handoff_v1.md` verwendet.

Wesentliche Vorgaben:

- mobile Admin-Oberfläche für iOS und Android
- Dark Mode
- Sprache Spanisch (`es-ES`)
- Amber als Marken- und Aktionsfarbe
- Coral ausschließlich für dringende Zustände
- vier Owner-Tabs: `Home`, `Clases`, `Métricas`, `Admin`
- Verwendung Expo-Go-kompatibler Pakete
- keine zusätzlichen Chart-Bibliotheken
- Safe-Area-Behandlung für iPhones und Android Edge-to-Edge

Die Router- und Safe-Area-Umsetzung wurde vor der Entwicklung mit der versionierten
Expo-Dokumentation abgeglichen.

## 3. Rollenabhängige Navigation

Die Navigation unterscheidet jetzt zwischen Ownern und anderen Rollen.

### Owner

Owner sehen eine eigene Admin-Oberfläche mit vier Tabs:

1. `Home`
2. `Clases`
3. `Métricas`
4. `Admin`

Der aktive Tab verwendet einen Amber-Kreis hinter dem Icon. Alle Tabs besitzen denselben
Icon-Slot, damit die Beschriftungen gleich ausgerichtet bleiben.

### Trainer und Mitglieder

Trainer und Mitglieder behalten die bisherige App-Oberfläche mit den vorhandenen
`Home`- und `Explore`-Tabs.

### Impersonation

Beim Start einer Benutzeransicht wechselt die Navigation automatisch auf die Oberfläche
der ausgewählten Rolle. Der Entwickler-Banner wurde auf Spanisch angepasst. Die echte
Owner-Session bleibt im Hintergrund erhalten.

Relevante Dateien:

- `src/components/admin/owner-tabs.tsx`
- `src/components/app-tabs.tsx`
- `src/components/app-tabs.web.tsx`
- `src/components/impersonation-banner.tsx`
- `src/app/(app)/index.tsx`

## 4. Zentrales Designsystem

Die bisherigen Admin-Farben wurden durch die Tokens aus der Spezifikation ersetzt.

Umgesetzt wurden:

- Seiten-, Karten- und inaktive Hintergründe
- Hairline-Rahmen
- Primär-, Sekundär-, Muted- und Disabled-Texte
- Amber-, Coral-, Grün- und Orange-Statusfarben
- Radien für Karten, Kalender, Eingaben, Chips und Badges
- einheitliche Abstände
- Typografierollen mit den Gewichten `400` und `500`

Gemeinsame Komponenten:

- Admin-Screen mit Safe-Area-Behandlung
- Header und Header-Icon-Buttons
- Badges
- Karten
- Filterchips
- Such- und Eingabefelder
- Fortschrittsbalken
- Personen-Avatare
- Chevron-Zeilen
- Primär- und Sekundärbuttons
- Skeleton-Ladezustände
- Leerzustände

Relevante Dateien:

- `src/constants/admin-theme.ts`
- `src/components/admin/admin-ui.tsx`
- `src/lib/admin-data.ts`

## 5. Admin-Home

Der Owner-Home-Screen wurde vollständig neu aufgebaut.

Enthalten:

- Kopfzeile `SUMMIT ADMIN`
- dynamisches heutiges Datum auf Spanisch
- Icon-Button für Buchungsanfragen
- Icon-Button für neue Mitgliedschaften
- Nachrichten-Button
- Monatskalender mit Montag als Wochenbeginn
- Amber-Punkte an Tagen mit Kursen
- auswählbarer Kalendertag
- Tagesagenda unter dem Kalender
- Belegungsstatus:
  - `Plazas disponibles`
  - `Pocas plazas disponibles`
  - `Casi lleno`
  - `Lleno`
- aufklappbare Kurse mit Teilnehmerliste
- Empty State `No hay clases este día`
- Pull-to-refresh
- Skeleton-Ladezustand

Die Kurs-, Mitglieder- und Belegungsdaten werden aus Supabase geladen.

Relevante Dateien:

- `src/components/admin/admin-home-screen.tsx`
- `src/components/admin/month-calendar.tsx`
- `src/hooks/use-admin-data.ts`

## 6. Clases

Der Tab `Clases` zeigt echte Supabase-Kurse zusammen mit lokal angelegten
Entwicklungs-Kursen.

Enthalten:

- Plus-Button für einen neuen Kurs
- Filter `Todos`, `Yoga`, `HIIT`, `Spinning`
- Trainer, Wochentag und Uhrzeit
- Status `Activo` oder `Borrador`
- Belegungsbalken und Kapazität
- reduzierte Darstellung unveröffentlichter Entwürfe
- Empty States
- Pull-to-refresh
- Skeleton-Ladezustände

Bei bestehenden Supabase-Kursen wird die Kategorie derzeit anhand von Titel und
Beschreibung erkannt, weil es im Datenbankschema noch kein Kategorie-Feld gibt.

Relevante Dateien:

- `src/app/(app)/classes.tsx`
- `src/components/admin/admin-classes-screen.tsx`

## 7. Nuevo curso

Der neue Kursdialog liegt außerhalb des Tab-Navigators. Dadurch wird auf diesem
Detailscreen keine Bottom-Navigation angezeigt.

Umgesetzt wurden:

- Kursname
- Kategoriechips
- Trainerauswahl
- Wiederholung `Una vez` / `Semanal`
- Mehrfachauswahl der Wochentage
- Start- und Endzeit
- Kapazität
- Preis
- Raum
- Toggle `Lista de espera`
- Toggle `Aprobar reservas`
- Toggle `Publicar curso`
- Aktionen `Borrador` und `Guardar curso`
- Validierung für Kursname und Kapazität

Die zusätzlichen V1-Felder können noch nicht in Supabase gespeichert werden, weil die
entsprechenden Datenbankspalten und Schreibfunktionen fehlen. Neue Kurse werden deshalb
über AsyncStorage lokal auf dem jeweiligen Gerät gespeichert und anschließend in
`Clases` angezeigt.

Relevante Dateien:

- `src/app/new-course.tsx`
- `src/lib/admin-course-store.ts`
- `src/app/_layout.tsx`

## 8. Métricas

Der Metriken-Screen enthält:

- Monatsauswahl
- KPI-Raster
- monatliche Belegung
- aktive Mitglieder
- abgeleitete Einnahmen
- offene Rechnungen
- Mitgliederentwicklung als Balkendiagramm
- Stoßzeiten als Balkendiagramm
- No-show-Rate
- Austritte im Monat
- kompakten Zwei-Wochen-Kalender

Ohne zusätzliche Chart-Bibliothek werden alle Diagramme mit normalen React-Native-Views
gerendert.

Echte Daten:

- aktive Mitglieder
- neue Mitglieder
- Kurse
- Kursanmeldungen
- Kapazitäten
- daraus berechnete Belegung

Entwicklungs-/Vorschaudaten:

- offene Rechnungen
- Stoßzeiten
- No-show-Rate
- Austritte
- Teile des historischen Vergleichs

Relevante Dateien:

- `src/app/(app)/metrics.tsx`
- `src/components/admin/admin-metrics-screen.tsx`

## 9. Admin-Verwaltung

Der frühere Kachel-Dashboard-Screen wurde durch die in der V1 spezifizierte
Verwaltungsansicht ersetzt.

Enthalten:

- Suchfeld für Mitglieder und Personal
- echte Mitglieder- und Personalliste
- Rollenanzeige
- Gesamtanzahl der Profile
- Link zur vollständigen Personenliste
- Übersicht `Gestión de roles`
- Bereiche für:
  - Studio-Profil
  - Mitgliedschaften und Preise
  - Zahlungen und Rechnungen
  - Stornierungsrichtlinie
  - Benachrichtigungen
  - Öffnungszeiten
- Entwicklungsbereich für Impersonation

Die Einstellungszeilen zeigen derzeit einen Hinweisdialog. Es wurden keine neuen
Backend-Einstellungen oder Datenbanktabellen angelegt.

Relevante Dateien:

- `src/app/(app)/admin/index.tsx`
- `src/app/(app)/admin/members.tsx`
- `src/app/(app)/admin/_layout.tsx`

## 10. Mitgliedsfreigaben und Buchungsanfragen

### Mitgliedsfreigaben

Die bestehende echte Freigabelogik wurde erhalten und visuell auf Admin V1 umgestellt.

- echte ausstehende Profile aus Supabase
- Freigeben über die vorhandene RPC-Funktion `review_user`
- Ablehnen über dieselbe geschützte RPC-Funktion
- spanische Bestätigungsdialoge
- Pull-to-refresh
- Skeleton- und Leerzustände

Datei:

- `src/app/(app)/admin/pending-members.tsx`

### Buchungsanfragen

Für Buchungsanfragen existiert noch keine Datenquelle im aktuellen Schema. Deshalb
werden in der Entwicklung zwei Vorschaukarten angezeigt.

- spanisches UI
- Belegung
- Annehmen/Ablehnen
- Aktionen zeigen einen Entwicklungs-Hinweis
- in Produktion wird ein Empty State angezeigt

Dateien:

- `src/app/(app)/admin/booking-requests.tsx`
- `src/components/admin-request-card.tsx`

## 11. Datenbank und Backend

Während der Admin-V1-Umsetzung wurde das Datenbankschema nicht verändert.

Vorhandene und verwendete Tabellen:

- `user_profiles`
- `courses`
- `course_enrollments`

Noch nicht im Schema vorhanden:

- Kurskategorien
- wöchentliche Wiederholungen
- Wochentage
- Räume
- Preise
- Wartelisten
- Buchungsfreigabe pro Kurs
- Veröffentlichungs-/Entwurfsstatus
- Buchungsanfragen
- Rechnungen und Zahlungen
- No-show-Daten
- historische Metriken

Die vorhandenen Rollen bleiben:

- `owner`
- `trainer`
- `customer`

## 12. Neue Abhängigkeit

Installiert wurde:

```text
@expo/vector-icons
```

Das Paket wird für Feather- und MaterialCommunityIcons verwendet und ist mit Expo Go
kompatibel.

Geänderte Dateien:

- `package.json`
- `package-lock.json`

## 13. Technische Prüfungen

Erfolgreich durchgeführt:

- TypeScript: `tsc --noEmit`
- Expo Doctor: `18/18 checks passed`
- vollständiger iOS-Export
- iOS-Bundle mit 1437 Modulen
- Expo Router und neue Routen erfolgreich gebündelt
- Feather- und MaterialCommunityIcons erfolgreich gebündelt
- `git diff --check` ohne Whitespace-Fehler

Der automatische Lint-Lauf konnte nicht eingerichtet werden, weil im Projekt noch keine
ESLint-Konfiguration existiert und Expo dafür einen Netzabruf starten wollte.

Ein optionaler statischer Web-Export scheitert weiterhin an der bestehenden
Supabase-/AsyncStorage-Initialisierung während des serverseitigen Renderings
(`window is not defined`). Das betrifft Expo Go auf iOS nicht.

## 14. Expo-Go-Verbindungsdiagnose vom 26. Juli 2026

Beim QR-Code-Test wurde festgestellt:

- der gestartete Metro-Prozess antwortete zunächst nicht auf HTTP-Anfragen
- kurz danach war der Metro-Prozess vollständig beendet
- anschließend lauschte kein Prozess mehr auf Port `8081`
- der alte QR-Code konnte deshalb nicht mehr funktionieren
- der PC verwendet die lokale WLAN-Adresse `192.168.0.134`
- das WLAN `vodafoneAA407R` ist in Windows als `Öffentlich` eingestuft
- es wurde keine aktive eingehende Firewall-Freigabe für Node.js gefunden

Empfohlener Start über einen Tunnel:

```powershell
npx expo start --clear --tunnel
```

Alternativ über LAN:

```powershell
npx expo start --clear --lan
```

Für LAN müssen PC und iPhone im selben WLAN sein, das Windows-Netzwerk sollte auf
`Privat` stehen, Node.js muss durch die Firewall erreichbar sein und Expo Go benötigt
auf dem iPhone die Berechtigung für das lokale Netzwerk.

Der jeweils neue QR-Code ist nur gültig, solange der dazugehörige Metro-Prozess läuft.

## 15. Aktueller Testablauf

```powershell
cd C:\Users\Scobo\OneDrive\Escritorio\Summit
npx expo start --clear --tunnel
```

Danach:

1. warten, bis im Terminal `Metro waiting on ...` erscheint
2. den neu erzeugten QR-Code mit dem iPhone scannen
3. als Esther beziehungsweise als freigegebener Owner anmelden
4. kontrollieren, dass `Home`, `Clases`, `Métricas` und `Admin` sichtbar sind
5. unter `Admin → Desarrollo` die Impersonation testen

## 16. Bekannte offene Punkte

### Fragen an den Chef

- Wie sollen die vertraglichen Trainingsmodelle abgebildet werden? Bisher waehlt ein Kunde
  entweder das Gruppenmodell oder das individuelle Modell. Zu klaeren sind insbesondere:
  ob beide Modelle dauerhaft gegenseitig ausgeschlossen bleiben, ob spaetere Modellwechsel oder
  Mischformen erlaubt sind und ab welchem Datum eine Vertragsaenderung gilt.

- Beim Gruppenmodell wird die vertragliche Anzahl mit einem Wert von eins bis sieben gespeichert.
  Bestaetigte Gruppenkurse zaehlen als einzelne Einheiten innerhalb der Kalenderwoche von Montag
  bis Sonntag; ein wiederkehrender Kurs mit mehreren Wochentagen verbraucht entsprechend mehrere
  Einheiten. Wartelistenplaetze und individuelle Trainings zaehlen nicht. Noch zu klaeren ist der
  Umgang mit nicht genutzten Einheiten, Feiertagen, Vertragspausen und dem Zeitpunkt spaeterer
  Vertragsaenderungen.

- Wie sollen Aenderungen an einem bereits belegten Kurs behandelt werden? Zu klaeren ist,
  welche Felder noch geaendert werden duerfen und was mit vorhandenen Einschreibungen,
  Buchungen, zukuenftigen Sitzungen und Benachrichtigungen passiert. Bis zur Entscheidung
  soll die Kursbearbeitung nur fuer vollstaendig unbelegte Kurse freigegeben werden.

- Festgelegte Regel fuer Gruppenwechsel: Das Suchfenster beginnt beim aktuellen Zeitpunkt und endet weiterhin
  vier Wochen nach dem Originaltermin. Ein kompatibler freier Termin darf daher auch vor dem
  urspruenglichen Termin liegen, solange er beim Auswaehlen noch nicht begonnen hat.

- Soll der Trainerkalender ausschließlich bestätigte, bevorstehende Personal-Training-Termine
  anzeigen oder auch abgeschlossene und abgesagte Termine? Falls weitere Status angezeigt werden
  sollen: Wie sollen sie visuell unterschieden werden und wie lange sollen sie im Kalender sichtbar
  bleiben?

- Vorläufige Annahme: Owner und zuständiger Kurstrainer dürfen jeden passenden Kunden der Filiale
  in einen Gruppenkurs aufnehmen; die persönliche Trainerzuweisung über `assigned_trainer_id` ist
  davon unabhängig. Die fachliche Entscheidung kann später nochmals geprüft werden.
- Buchungsanfragen sind weiterhin Entwicklungsdaten.
- Einige Metriken sind Vorschaudaten.
- Neue V1-Kurse werden nur lokal auf dem Gerät gespeichert.
- Die Admin-Einstellungen sind noch nicht mit Backend-Daten verbunden.
- Die V1-Änderungen sind noch nicht als eigener Git-Commit gespeichert.
- Der optionale Web-Static-Export benötigt eine separate Korrektur.
