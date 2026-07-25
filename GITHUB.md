# 🏃 Summit - Sport App

Eine moderne React-Native Sport-App mit Expo, Supabase Authentication und Role-Based Access Control.

## 🎯 Features

- **Authentifizierung**: Email/Passwort Login & Registration via Supabase
- **Rollen-System**: Owner, Trainer, Customer mit unterschiedlichen Berechtigungen
- **Approval Workflow**: Neue User müssen vom Studio-Owner bestätigt werden
- **Admin Panel**: Owner kann User verwalten (genehmigen/ablehnen)
- **Responsive UI**: iOS, Android und Web Support

## 🚀 Quick Start

### 1. Repository klonen
```bash
git clone <your-github-repo>
cd summit
```

### 2. Dependencies installieren
```bash
npm install
```

### 3. Environment Setup
```bash
# .env.example kopieren
cp .env.example .env.local

# Dann mit deinen Supabase Credentials ausfüllen
```

**In `.env.local` eintragen:**
- `EXPO_PUBLIC_SUPABASE_URL` - Deine Supabase Project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Dein Supabase Anon Key

### 4. Datenbank initialisieren
```bash
# Öffne Supabase Dashboard SQL Editor
# Copy-Paste den Inhalt von DATABASE_SCHEMA.sql
# Führe die Query aus
```

### 5. App starten
```bash
# iOS Simulator
npm run ios

# Android Emulator
npm run android

# Web
npm run web

# Oder mit Expo Go
expo start
```

## 📁 Projektstruktur

```
src/
├── app/                 # Expo Router Navigation
│   ├── auth/           # Login & Signup Screens
│   ├── (app)/          # Protected App Routes
│   ├── index.tsx       # Home Screen
│   ├── pending.tsx     # User awaiting approval
│   └── admin-panel.tsx # Owner admin controls
├── context/
│   └── auth-context.tsx # Global Auth State
├── components/         # Reusable Components
├── lib/
│   └── supabase.ts     # Supabase Client & Types
└── constants/          # App constants & theme
```

## 🔐 Environment Variables

**Öffentliche Variables** (können committet werden):
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

**Private Variables** (NIEMALS committen):
- `.env` und `.env.local` sind in `.gitignore`

## 👥 User Workflow

### Öffentlich (Kein Login)
- Studio Info sehen
- Keine Kurse

### Nach Registrierung (Status: "pending")
- Email-Verifizierung
- Wartet auf Admin-Bestätigung
- Sieht nur Stammdaten

### Nach Bestätigung (Status: "approved")
- Voll Zugriff auf alle Features
- Kann Kurse buchen
- Sieht Trainingspläne

## 🛠️ Development

### Branches
```bash
# Neue Feature
git checkout -b feature/feature-name

# Bugfix
git checkout -b bugfix/bug-name

# Develop Branch
git checkout -b develop
```

### Commits
```bash
git add .
git commit -m "feat: add new feature"
git push origin feature/feature-name
```

### Pull Requests
1. Push dein Branch zu GitHub
2. Öffne einen Pull Request
3. Beschreibe deine Änderungen
4. Merge zu main

## 📝 Available Scripts

```bash
npm start       # Start Expo server
npm run ios     # Run on iOS
npm run android # Run on Android
npm run web     # Run on Web
npm run lint    # Run ESLint
```

## 🐛 Häufige Probleme

### "Supabase nicht verbunden"
```bash
# Überprüfe .env.local
cat .env.local

# Stelle sicher, dass EXPO_PUBLIC_SUPABASE_URL und KEY gesetzt sind
```

### "Module not found"
```bash
# Dependencies neu installieren
rm -rf node_modules package-lock.json
npm install
```

### "Expo CLI nicht gefunden"
```bash
npm install -g expo-cli
```

## 📚 Setup & Dokumentation

Siehe [SETUP.md](./SETUP.md) für detaillierte Supabase Setup-Instructions.

## 🔗 Links

- [Expo Documentation](https://docs.expo.dev)
- [Supabase Documentation](https://supabase.com/docs)
- [React Native Documentation](https://reactnative.dev)
- [Expo Router Documentation](https://expo.github.io/router)

## 📄 Lizenz

Siehe [LICENSE](./LICENSE)

## 👤 Author

[Dein Name]

## 🤝 Contributing

1. Fork das Repository
2. Erstelle einen Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Committe deine Änderungen (`git commit -m 'Add some AmazingFeature'`)
4. Push zu dem Branch (`git push origin feature/AmazingFeature`)
5. Öffne einen Pull Request

---

**Viel Spaß beim entwickeln! 🚀**
