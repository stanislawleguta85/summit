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
