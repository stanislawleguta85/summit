# 🚀 Git Setup für Summit

## Schritt-für-Schritt Setup für GitHub

### 1. GitHub Repository erstellen

1. Gehe zu [github.com/new](https://github.com/new)
2. **Repository name**: `summit`
3. **Description**: `Sport App mit Supabase Auth & Rollen-System`
4. **Visibility**: Private (oder Public wenn du das möchtest)
5. **Initialize this repository**: ❌ NICHT ankreuzen (haben schon Dateien)
6. Click "Create repository"

### 2. Lokales Git Repository initialisieren

```bash
cd c:\Users\Scobo\OneDrive\Escritorio\Summit

# Initialisiere Git (falls nicht vorhanden)
git init

# Setze deine Git Konfiguration (einmalig)
git config user.name "Dein Name"
git config user.email "deine@email.com"

# Oder global für alle Projekte:
git config --global user.name "Dein Name"
git config --global user.email "deine@email.com"
```

### 3. Remote Repository verbinden

```bash
# GitHub URL einsetzen (HTTPS oder SSH)
# Ersetze YOUR_USERNAME mit deinem GitHub Username

# Mit HTTPS (einfacher, aber brauchst Personal Access Token für push)
git remote add origin https://github.com/YOUR_USERNAME/summit.git

# Mit SSH (sicherer, brauchst SSH Key)
git remote add origin git@github.com:YOUR_USERNAME/summit.git
```

### 4. Alle Dateien adden und committen

```bash
# Überprüfe was hinzugefügt wird
git status

# Alle Dateien hinzufügen (ausgenommen .gitignore)
git add .

# Erstes Commit
git commit -m "initial: set up project with auth system"
```

### 5. Zu GitHub pushen

```bash
# Main Branch erstellen und pushen
git branch -M main
git push -u origin main
```

### 6. .env.local erstellen (NICHT committen!)

```bash
# .env.example kopieren und ausfüllen
cp .env.example .env.local

# Mit deinen echten Supabase Credentials ausfüllen
# (wird von git ignoriert, bleibst sicher!)
```

---

## ✅ Fertig!

Dein Projekt ist jetzt auf GitHub! 🎉

### Nächste Commits

```bash
# Nachdem du Änderungen machst
git status              # Was hat sich geändert?
git add .              # Alles zum Staging adden
git commit -m "feat: add feature"  # Mit aussagekräftiger Message
git push               # Zu GitHub pushen
```

### Branch Workflow (Empfohlen)

```bash
# Für neue Features
git checkout -b feature/new-feature
# ... mache deine Änderungen ...
git add .
git commit -m "feat: new-feature"
git push origin feature/new-feature

# Dann auf GitHub Pull Request erstellen
```

---

## 🔧 SSH Setup (Optional, empfohlen)

SSH ist sicherer als HTTPS. Setup:

```bash
# SSH Key generieren (falls nicht vorhanden)
ssh-keygen -t ed25519 -C "deine@email.com"

# Public Key anzeigen und kopieren
cat ~/.ssh/id_ed25519.pub

# Gehe zu github.com/settings/keys
# Click "New SSH key"
# Paste dein Public Key
# Speichern
```

---

## 🔑 Personal Access Token (Falls HTTPS)

```bash
# Gehe zu github.com/settings/tokens
# Click "Generate new token"
# Select "repo" scope
# Generate und kopieren

# Dann beim Push:
git push
# Username: YOUR_USERNAME
# Password: <paste den token>
```

---

## 📚 Wichtige Git Befehle

```bash
# Status sehen
git status

# Änderungen sehen
git diff
git diff --staged

# Letzten Commit anschauen
git log -1
git log --oneline

# Änderungen rückgängig machen
git restore <file>         # Undo working changes
git restore --staged <file> # Undo staging

# Branch erstellen & wechseln
git checkout -b feature/name
git checkout main

# Branch löschen
git branch -d feature/name

# Alle Branches sehen
git branch -a

# Pull von GitHub
git pull origin main

# Alles pullen & pushen
git fetch
git push
```

---

## ❌ Häufige Fehler

### "fatal: not a git repository"
```bash
# Du bist nicht im richtigen Ordner
cd c:\Users\Scobo\OneDrive\Escritorio\Summit
git status
```

### "Permission denied (publickey)"
```bash
# SSH Key Problem
ssh-keygen -t ed25519 -C "deine@email.com"
# Dann GitHub Settings > SSH Keys > Add
```

### "src refspec main does not match any"
```bash
# Du hast noch nicht committed
git add .
git commit -m "initial commit"
git branch -M main
git push -u origin main
```

### ".env.local wurde committed!"
```bash
# Zu spät! Dann:
git rm --cached .env.local
git commit -m "remove: .env.local from git"
git push

# Und füge zu .gitignore hinzu (ist schon gemacht)
```

---

## 🎯 Checklist

- [ ] GitHub Account erstellt
- [ ] Repository auf GitHub erstellt
- [ ] Git initialisiert (`git init`)
- [ ] Remote URL hinzugefügt (`git remote add origin`)
- [ ] Alle Dateien committed (`git add .` & `git commit`)
- [ ] Zu GitHub gepusht (`git push -u origin main`)
- [ ] `.env.local` erstellt und in `.gitignore` (sicher!)
- [ ] `.github/workflows/lint.yml` ist ready

**Viel Erfolg mit deinem GitHub Projekt! 🚀**
