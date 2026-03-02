# Quick Start Guide

## 30-Second Setup

### 1. Open in Live Server (VS Code)
- Install "Live Server" extension in VS Code
- Right-click `index.html` → **Open with Live Server**
- Browser opens automatically

### 2. Add Firebase Authorized Domain
Go to [Firebase Console](https://console.firebase.google.com) → `flashcards-srs` project:
- **Authentication > Settings > Authorized domains**
- Add: `localhost` and `127.0.0.1`

### 3. Test
- Create account in the app
- Add a German word
- Click "Translate + Preview"
- Edit translation if needed
- Click "✓ Save Card"
- See it sync in "My words" list

---

## What Changed (from previous version)

### ✅ Better Translation Quality
- **Primary**: LibreTranslate (better for most words)
- **Fallback**: MyMemory (if LibreTranslate fails)
- **Never saves**: Invalid/error translations

### ✅ Better Examples
- Returns 3-5 example sentences (was 4 max)
- Better handling of single words
- Shows German-only if English translation missing

### ✅ Manual Override
- Edit English translation BEFORE saving
- Useful when AI gets it wrong
- Clear button to reset

### ✅ Improved UI
- Modern cards with hover effects
- Better mobile responsiveness
- Cleaner typography & spacing
- Smooth animations

---

## For Troubleshooting

See **README.md** for detailed docs on:
- Firestore setup
- Deploying to GitHub Pages
- Known limitations
- API rate limits
