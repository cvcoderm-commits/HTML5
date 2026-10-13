# J.A.R.V.I.S. — AI Operating System

A browser-based, sci-fi-styled desktop with an AI chat assistant, voice control,
camera-based hand-gesture recognition, and a set of mini-apps (calculator, notes,
to-do list, terminal, code editor, music player, and more).

## Files

- `index.html` — the app shell / markup
- `styles.css` — all visual styling
- `app.js` — all application logic
- `server.py` — a tiny local server (see below — required for camera/mic)

## ⚠️ Important: how to run it so camera & mic actually work

Browsers **block camera and microphone access on pages opened by double-clicking
a file** (`file:///...` URLs). This is a browser security rule, not a bug in this
app — it applies to every website, not just this one. To unlock camera and mic,
the page needs to be served over `http://localhost` (or `https://`).

**Run it like this:**

```bash
cd path/to/this/folder
python3 server.py
```

It will print a URL (usually `http://localhost:8000/index.html`) and try to open
it automatically. If it doesn't, just paste that URL into your browser.

Requires Python 3 (already installed on most Mac/Linux machines; on Windows,
install from python.org and check "Add to PATH").

No Python? Any static file server works, e.g. with Node.js:
```bash
npx serve .
```

## Enabling each feature

| Feature | What to do |
|---|---|
| **Buttons / windows / dock apps** | Work immediately, no setup — calculator, notes, to-do, terminal, music, code editor, settings, clock, weather. |
| **Microphone / voice commands** | Click the 🎤 button (or press `Ctrl+Space`). Your browser will ask for mic permission the first time — click **Allow**. Say "Hey Jarvis" followed by a command, or just speak directly while listening. Uses your browser's built-in Web Speech API (best support in Chrome/Edge). |
| **Camera / hand gestures** | Open the 📷 Camera app. Your browser will ask for camera permission — click **Allow**. Supports Open Palm, Closed Fist, Thumbs Up/Down, Victory sign, Pointing, and Pinch gestures. |
| **AI Chat (Gemini)** | Open ⚙ Settings and paste in your own free Gemini API key, then Save. Get a key at https://aistudio.google.com/app/apikey — the free tier is generous. Without a key, the Chat window will prompt you to add one. |

## Notes

- All your data (chat history, notes, to-do list, settings, API key) is stored
  only in your browser's local storage — nothing is sent anywhere except your
  own requests to Google's Gemini API (only when you use AI Chat / code
  explain-debug-optimize).
- If your browser blocks the permission prompt, check the padlock/site-info
  icon in the address bar and allow Camera/Microphone manually, then reload.
- Voice recognition needs an internet connection (it's provided by your
  browser, e.g. Chrome sends audio to Google's speech service).
