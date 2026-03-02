# Firebase Configuration Guide

## Project Details

```
Project Name: flashcards-srs
Project ID: flashcards-srs
Authentication: Email/Password enabled
Database: Firestore (NoSQL)
```

## Firebase Config (in app.js)

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyD5jk9FcywvGBNRLGlSHeLFnbTXcOBYDCc",
  authDomain: "flashcards-srs.firebaseapp.com",
  projectId: "flashcards-srs",
  storageBucket: "flashcards-srs.firebasestorage.app",
  messagingSenderId: "335428443475",
  appId: "1:335428443475:web:fdbbdfbf5e9e6bb45cd5a6"
};
```

This is already in your `app.js` file. No changes needed.

---

## Required Firebase Setup

### 1. Authorized Domains

⚠️ **MUST DO THIS OR LOGIN WILL FAIL**

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select project: **`flashcards-srs`**
3. Navigate: **Authentication > Settings > Authorized domains**
4. Add these domains:

| Domain | Use |
|--------|-----|
| `saurabh-pawarr.github.io` | Production (GitHub Pages) |
| `localhost` | Local dev (Live Server) |
| `127.0.0.1` | Local dev (Python HTTP server) |

**Without these, you'll get "Authentication domain not authorized" error.**

### 2. Firestore Security Rules

Go to **Firestore > Rules** and set to:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/cards/{document=**} {
      allow read, write: if request.auth.uid == uid;
    }
  }
}
```

This ensures:
- ✅ Users can only see/edit their own cards
- ✅ New users can create their path automatically
- ✅ Secure by default

### 3. Enable Email/Password Authentication

1. Go to **Authentication > Sign-in method**
2. Ensure **Email/Password** is **enabled**
3. You should see ✅ status

---

## Data Structure

Firestore will auto-create this structure:

```
users/
  {uid}/
    cards/
      {cardId}:
        phrase: "überzeugt"
        lang: "de"
        en: "convinced"
        examples: [
          { src: "...", en: "..." }
        ]
        dueAt: 1735689600000  (timestamp)
        lastGrade: "good"
        createdAt: ... (server timestamp)
        updatedAt: ... (server timestamp)
```

### Card Fields

| Field | Type | Description |
|-------|------|-------------|
| `phrase` | string | Original word/phrase (e.g., "überzeugt") |
| `lang` | string | Detected language code (e.g., "de") |
| `en` | string | English translation |
| `examples` | array | Example sentences (optional) |
| `dueAt` | timestamp | When card should be studied next |
| `lastGrade` | string | Last rating: "again", "hard", "good", "easy" |
| `createdAt` | timestamp | When card was created (server time) |
| `updatedAt` | timestamp | Last modified (server time) |

---

## Testing Firestore Access

1. Log in with test account in the app
2. Go to **Firestore > Data** in Firebase Console
3. You should see: `users > YOUR_UID > cards`
4. Add a word in the app
5. Refresh Firestore console—you'll see the card appear!

---

## Troubleshooting

### "Authentication domain not authorized"
- **Fix**: Add domain to Authorized Domains (see above)
- Check spelling (lowercase!)

### "You do not have permission to access this document"
- **Fix**: Security rules not set correctly
- Paste the rule from section 2 above

### Cards not saving
- **Fix**: Check Firestore quota (free tier: 1 GB storage, 50K reads/day)
- Make sure Firestore is **created** (not just Firebase project)

### Can't create account
- **Fix**: Check Email/Password auth is enabled
- Try a different email

---

## Upgrading Later

If you hit free tier limits:
- **Firestore**: Free tier is 1 GB storage + 50K reads/day (very generous for personal use)
- **Auth**: Free tier unlimited (no limit on auth operations)

Just upgrade the Firestore plan in Firebase Console if needed.

---

## Important: Keep API Key Private

The `apiKey` in `app.js` is **public** (it's in your GitHub repo, which is fine). Firebase APIs are secured by:
- ✅ Firestore rules (users only see their own data)
- ✅ Authentication (must be logged in)
- ✅ CORS (browser enforced)

**You do NOT need to hide the API key** for this app.

---

## Testing on Multiple Devices

1. Deploy to GitHub Pages (see README.md)
2. Open `https://your-username.github.io/flashcards-srs/` on phone + laptop
3. Create same account on both
4. Add card on phone
5. Refresh laptop—card appears! ✨

(Firestore syncs instantly with same auth.)

---

## Getting Help

- **Firebase Docs**: https://firebase.google.com/docs
- **Firestore Security**: https://firebase.google.com/docs/firestore/security/rules-structure
- **GitHub Issues**: Open issue in your repo
