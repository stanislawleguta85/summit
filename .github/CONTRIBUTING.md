# Contributing zu Summit

Vielen Dank, dass du zu Summit beitragen möchtest! 🎉

## Code of Conduct

- Sei respektvoll gegenüber anderen Entwicklern
- Gebe hilfreiche Feedback
- Arbeite konstruktiv zusammen

## Wie du beitragen kannst

### 1. Issues erstellen
- Beschreibe das Problem klar
- Schreibe Schritte zum Reproduzieren
- Gebe dein Environment an

### 2. Features vorschlagen
- Öffne ein GitHub Issue
- Erkläre die Motivation
- Gebe Beispiele wenn möglich

### 3. Code beitragen

#### Setup
```bash
git clone <repo>
cd summit
npm install
cp .env.example .env.local
# Fülle .env.local aus
```

#### Branch erstellen
```bash
git checkout -b feature/your-feature
```

#### Code Style
- Use TypeScript für alle `.tsx` und `.ts` Dateien
- Nutze `expo lint` für Code-Qualität
- Schreibe aussagekräftige Commit Messages

```bash
# Gutes Commit Message Format
git commit -m "feat: add new feature"
git commit -m "fix: resolve bug in login"
git commit -m "docs: update README"
git commit -m "refactor: improve code structure"
```

#### Testing
```bash
# Teste deine Änderungen
npm run ios      # oder android oder web
npm run lint
```

#### Push & Pull Request
```bash
git push origin feature/your-feature
```

1. Gehe zu GitHub und öffne einen Pull Request
2. Beschreibe deine Änderungen
3. Verlinke relevante Issues mit `#issue-number`
4. Warte auf Review

### 4. Dokumentation verbessern
- Typos beheben
- Setup-Guides verbessern
- Neue Guides schreiben

## Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- `feat`: Neue Feature
- `fix`: Bug Fix
- `docs`: Dokumentation
- `style`: Code Style (keine Logic Änderung)
- `refactor`: Refactoring
- `perf`: Performance Improvement
- `test`: Tests hinzufügen
- `chore`: Dependencies, Build etc.

### Examples
```
feat(auth): add Google login support
fix(admin-panel): fix user approval bug
docs(setup): add Supabase instructions
refactor(components): improve code structure
```

## Development Workflow

```
1. Fork das Repository
   ↓
2. Clone dein Fork
   git clone https://github.com/YOUR_USERNAME/summit.git
   ↓
3. Erstelle einen Feature Branch
   git checkout -b feature/my-feature
   ↓
4. Mache deine Änderungen
   ↓
5. Teste alles
   npm run lint
   npm run ios (oder android/web)
   ↓
6. Committe deine Änderungen
   git commit -m "feat: add my feature"
   ↓
7. Push zu GitHub
   git push origin feature/my-feature
   ↓
8. Öffne einen Pull Request
   ↓
9. Warte auf Review & Merge
```

## Pull Request Checkliste

- [ ] Mein Code ist getestet
- [ ] Ich habe `npm run lint` ausgeführt
- [ ] Meine Branch ist up-to-date mit `main`
- [ ] Ich habe aussagekräftige Commit Messages geschrieben
- [ ] Ich habe Dokumentation aktualisiert (falls nötig)
- [ ] Ich habe keine Breaking Changes gemacht (oder dokumentiert)

## Issues

### Bug Reports
```markdown
## Beschreibung
[Kurze Beschreibung des Bugs]

## Schritte zum Reproduzieren
1. ...
2. ...
3. ...

## Erwartetes Verhalten
[Was sollte passieren]

## Tatsächliches Verhalten
[Was passiert wirklich]

## Environment
- OS: [z.B. Windows, macOS, Linux]
- Node: [Version]
- Expo: [Version]
```

### Feature Requests
```markdown
## Beschreibung
[Beschreibe die neue Feature]

## Motivation
[Warum brauchen wir das?]

## Beispiele
[Wie sollte es funktionieren?]
```

## Fragen?

- Öffne ein Discussion auf GitHub
- Stelle Fragen in Issues
- Kontaktiere die Maintainer

---

**Danke für dein Beitrag! 🙏**
