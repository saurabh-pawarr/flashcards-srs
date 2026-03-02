# Flashcards SRS - Free & Open

A **free, open-source spaced repetition system** (SRS) for learning languages. Sync your flashcards across devices using Firebase, with intelligent translation and example retrieval powered by free APIs.

**Features:**
- 📱 Works on laptop & mobile with real-time sync (Firebase)
- 🌍 Free translation pipeline (LibreTranslate + MyMemory fallback)
- 📚 Automatic example sentences from Tatoeba
- 🎨 Modern, responsive dark UI
- 💾 No backend required—GitHub Pages static website
- ✏️ Manual translation override if AI gets it wrong
- 🔒 Secure: Your data only syncs to your Firestore account

---

## Architecture

### Stack
- **Hosting**: GitHub Pages (static files only)
- **Auth**: Firebase Authentication (email/password)
- **Database**: Firestore (user-scoped security rules)
- **Translation**: LibreTranslate + MyMemory (both free/public)
- **Examples**: Tatoeba public API
- **UI**: Plain HTML/CSS/JS (no build step, no Node.js required)

### Data Structure (Firestore)
```
users/
  {uid}/
    cards/
      {cardId}:
        phrase: "überzeugt"
        lang: "de"
        en: "convinced"
        examples: [
          { src: "German sentence", en: "English translation" }
        ]
        dueAt: <timestamp>
        lastGrade: "good"
        createdAt: <timestamp>
        updatedAt: <timestamp>
```

### Security
Firestore rules restrict all reads/writes to the user's own UID path:
```javascript
allow read, write: if request.auth.uid == resource.data.uid;
```

---

## Setup (Local Development)

### 1. Clone & Install Live Server

```bash
git clone https://github.com/saurabh-pawarr/flashcards-srs.git
cd flashcards-srs
```

Install **Live Server** extension in VS Code:
- Open VS Code → Extensions (Ctrl+Shift+X / Cmd+Shift+X)
- Search for "Live Server"
- Install the one by "Ritwick Dey"

Or use **Python** if you have it:
```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

### 2. Configure Firebase Authorized Domains

Go to [Firebase Console](https://console.firebase.google.com):

1. Select project **`flashcards-srs`**
2. Navigate to **Authentication > Settings > Authorized domains**
3. Add these domains (if not already present):
   - `saurabh-pawarr.github.io` (production)
   - `localhost` (local dev)
   - `127.0.0.1` (local dev)

### 3. Start Local Server

**Option A: Live Server (easiest)**
- Right-click `index.html` → **Open with Live Server**
- Browser opens to `http://127.0.0.1:5500/`

**Option B: Python**
```bash
python -m http.server 8000
# Open http://localhost:8000 in browser
```

### 4. Test & Login
1. Go to `http://localhost:8000` or `http://127.0.0.1:5500/`
2. Create an account or login with email/password
3. Add a German word → Translate → Save
4. Go to mobile, login with same email → See your cards synced! ✨

---

## Usage Guide

### Adding Cards

1. **Type** a German word or phrase in the textarea
2. Click **"Translate + Preview"**
3. Review the auto-translation and examples
4. **Edit the English translation** if needed (it's editable!)
5. Click **"✓ Save Card"** to add to Firestore

**Translation Quality Tips:**
- Single words often work best (e.g., "überzeugt")
- Multi-word phrases may need manual correction
- Examples come from real Tatoeba sentences
- If translation fails, you can manually type the English and still save

### Study Mode

1. Click **"Study"** section
2. Cards appear in **Tinder-style swipe cards**
3. Click **"Reveal"** to flip and see the English translation
4. Rate the card:
   - **Again** (today) — need more practice
   - **Hard** (1 day) — got it but need to repeat soon
   - **Good** (1 week) — solid
   - **Easy** (1 month) — mastered

**Swipe Controls:**
- Swipe **left** → "Again"
- Swipe **right** → "Easy"
- Use buttons for "Hard" and "Good"

### My Words List

1. Search by phrase or English translation
2. View all your cards
3. Delete individual cards with the **Delete** button

---

## Free API Services Used

| Service | What | Free Tier | Rate Limit |
|---------|------|-----------|-----------|
| **LibreTranslate** | Translation (primary) | ✅ Yes | 100 req/5min (public) |
| **MyMemory** | Translation (fallback) | ✅ Yes | Unlimited (best effort) |
| **Tatoeba** | Example sentences | ✅ Yes | Reasonable for hobby use |

**No API keys required.** All services are public & free. No billing, no signup.

---

## Known Limitations & Workarounds

### Translation quality can vary
- **Why**: Free APIs are less advanced than paid DeepL/OpenAI
- **Fix**: Edit the translation before saving. The app lets you!

### Examples might be sparse for uncommon words
- **Why**: Tatoeba relies on user-contributed data
- **Fix**: Still save the card—the translation might be all you need

### Tatoeba unavailable sometimes
- **Why**: It's run by volunteers
- **Fix**: You can still save cards without examples

### Rate limits?
- **Why**: Free public APIs have rate limits
- **Fix**: We use multiple providers; rarely an issue for hobby use

---

## Deployment to GitHub Pages

### Before you deploy:

1. **Ensure Firebase is configured** (auth domains, Firestore rules)
2. **Test locally** with `Live Server`
3. **Push to GitHub** (your repo should be public for GitHub Pages)

### Deploy steps:

1. Go to your repo **Settings → Pages**
2. Select **Deploy from a branch**
3. Choose branch: **main** (or **master**)
4. Select folder: **/ (root)**
5. Click **Save**
6. Site will be live at: `https://YOUR_USERNAME.github.io/flashcards-srs/`

> Firebase must have your GitHub Pages domain in **Authorized Domains**

---

## Firestore Security Rules (Reference)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own cards
    match /users/{uid}/cards/{document=**} {
      allow read, write: if request.auth.uid == uid;
    }
  }
}
```

Copy this into Firebase Console → Firestore → Rules tab.

---

## Troubleshooting

### "Translation failed or unavailable"
- Check internet connection
- Try a different word (some might not have good translations)
- Manually type the English translation and save anyway
- If consistent, LibreTranslate might be temporarily down—try later

### "No examples found"
- This is normal for rare words
- The card still saves—you have the translation
- Tatoeba doesn't have coverage for all words

### Login not working
- Check Firebase **Authorized Domains** include `localhost` or `127.0.0.1`
- Check your email/password (case-sensitive)
- Try creating a new account

### Cards not syncing to mobile
- Make sure you're logged in with the **same email** on both devices
- Check internet connection
- Wait a few seconds (Firestore has slight latency)
- Refresh the page

### App looks broken on mobile
- Clear browser cache (Settings → Clear browsing data)
- Zoom out if text is cut off
- Try landscape orientation

---

## Contributing

Found a bug? Want to improve translation quality?

1. **For bugs**: Open a GitHub issue
2. **For translations**: The app uses free APIs; consider helping Tatoeba instead (https://tatoeba.org)
3. **For code**: Fork, improve, submit PR

---

## License

MIT License — use freely, modify, redistribute.

---

## Credits

- **Firebase** for free auth & database
- **LibreTranslate** & **MyMemory** for free translation
- **Tatoeba** for free example sentences
- **GitHub Pages** for free hosting

---

## Questions?

- Open a GitHub issue
- Check Firebase docs: https://firebase.google.com/docs
- LibreTranslate docs: https://github.com/LibreTranslate/LibreTranslate

Happy learning! 🚀