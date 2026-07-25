# Summit - Supabase Setup Guide

## 🚀 Schritte für die Einrichtung

### 1. Supabase Projekt erstellen
- Gehe zu https://supabase.com
- Erstelle ein neues Projekt
- Warte bis der Projekt initialisiert ist

### 2. Datenbank erstellen
- Kopiere den SQL Code aus `DATABASE_SCHEMA.sql`
- Gehe zu deinem Supabase Projekt → SQL Editor
- Erstelle eine neue Query
- Paste den kompletten SQL Code
- Führe die Query aus

### 3. Supabase Credentials konfigurieren
- Gehe zu deinem Supabase Projekt → Settings → API
- Kopiere:
  - **Project URL** (z.B. `https://your-project.supabase.co`)
  - **Anon Public Key** (unter Anon Key)

### 4. Credentials in App eintragen
Öffne `src/lib/supabase.ts` und ersetze:
```typescript
const SUPABASE_URL = 'https://your-project.supabase.co'; // Deine URL
const SUPABASE_ANON_KEY = 'your-anon-key'; // Dein Anon Key
```

### 5. Erste Testdaten
Führe folgendes SQL aus, um eine Test-Company zu erstellen:

```sql
INSERT INTO public.companies (id, name, description) 
VALUES ('default-company', 'Mein Studio', 'Mein erstes Studio');
```

---

## 📝 User Workflow

### 1. Registrierung
- User registriert sich mit Email/Passwort + Name
- User erhält Status `pending`
- User kann nur Stammdaten des Studios sehen

### 2. Admin Bestätigung
- Owner sieht alle `pending` User im Admin Panel
- Owner kann User genehmigen oder ablehnen
- User erhält Status `approved` oder `rejected`

### 3. Zugriff nach Bestätigung
- User mit Status `approved` kann alle Kurse sehen
- User kann sich in Kurse anmelden
- Voll Zugriff auf die App

---

## 🔐 Rollen & Berechtigungen

### Owner (Studio-Inhaber)
- Admin Panel Zugriff
- Kann User bestätigen/ablehnen
- Kann Kurse erstellen

### Trainer
- Kann Kurse erstellen/bearbeiten
- Sieht angemeldete User
- Kann Feedback geben

### Customer (Kunde)
- Sieht verfügbare Kurse (nach Bestätigung)
- Kann sich anmelden
- Sieht eigene Trainingspläne

---

## 🧪 Testen

### 1. App starten
```bash
npm install
expo start
```

### 2. Testbenutzer erstellen
- Öffne die App
- Gehe zu "Registrieren"
- Erstelle einen Test-Account
- Du solltest auf dem "Pending" Screen landen

### 3. Als Owner genehmigen
- Registriere einen Owner-Account (nutze den `role: 'owner'` in der DB)
- Gehe zum Admin Panel
- Genehmige den Test-Benutzer

---

## 🐛 Häufige Probleme

### "Supabase nicht verbunden"
- Überprüfe die Credentials in `src/lib/supabase.ts`
- Stelle sicher, dass deine API Key aktiv ist

### "User Profile nicht gefunden"
- Überprüfe, dass die `user_profiles` Tabelle existiert
- Überprüfe RLS Policies in Supabase

### "pending" Screen wird nicht angezeigt
- Stelle sicher, dass `userProfile?.status` in `auth-context.tsx` richtig gesetzt ist
- Überprüfe die Supabase Response

---

## 📦 Abhängigkeiten

Diese wurden bereits installiert:
- `@supabase/supabase-js` - Supabase Client
- `@react-native-async-storage/async-storage` - Lokale Session Persistierung
- `expo-router` - Navigation
- `react-native` - UI Framework

---

## 🎯 Nächste Schritte

1. ✅ Supabase Setup abgeschlossen
2. ⬜ Login/Sign-up implementieren → FERTIG ✅
3. ⬜ Admin Panel hinzufügen → FERTIG ✅
4. ⬜ Kurse & Anmeldung implementieren
5. ⬜ Benachrichtigungen hinzufügen
6. ⬜ Für iOS/Android builden

---

## 💡 Tipps

- Nutze den Supabase SQL Editor zum Debuggen
- Überprüfe immer die Logs in der Browser Console
- Nutze AsyncStorage DevTools zum Debuggen von Sessions

Viel Erfolg! 🚀
