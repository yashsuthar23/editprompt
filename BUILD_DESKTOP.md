# EditPrompt — Desktop build (v6)

What changed so it feels like real software instead of a website:

1. **`desktop-entry.js`** — new entry point. Starts the same `server.js`
   backend, waits for it to come up, then opens it in a Chrome/Edge **app
   window** (`--app=` mode): no address bar, no tabs, own taskbar entry.
   Closing that window quits the whole app (server included).
2. **Custom icon** — `build-assets/icon.ico` (placeholder "EP" mark; drop in
   your real logo as `icon.ico`/`icon.png`, same sizes, to replace it).
3. **`build.ps1`** — one command that bundles, embeds the icon, and produces
   `EditPrompt.exe`.
4. **`setup.iss`** — Inno Setup script that turns the exe into a real
   Windows installer with Start Menu + Desktop shortcuts and an uninstaller.

## Build the exe

```powershell
npm install
.\build.ps1
```

Output: `EditPrompt.exe` in the project root. It still needs `public/`,
`downloads/`, `.env`, and `editprompt.db` sitting next to it — same as
before, just now double-clicking it opens an app window instead of a
console + browser tab.

Quick test without building the exe:
```powershell
npm run desktop
```

## Build the installer (optional but recommended)

1. Install [Inno Setup](https://jrsoftware.org/isdl.php) (free, one-time, on
   your dev PC only — not needed by end users).
2. Run `.\build.ps1` first so `EditPrompt.exe` exists.
3. Open `setup.iss` in Inno Setup and click **Compile** (or right-click the
   file → Compile).
4. `installer-output\EditPrompt-Setup-6.0.0.exe` is what you hand to users —
   it installs to Program Files, adds shortcuts, and includes an uninstaller.

## Notes

- `.env` is only copied on first install (`onlyifdoesntexist`) so re-installs
  don't wipe configured Razorpay/SMTP keys — fill it in after first install.
- A fresh install does **not** ship your existing `editprompt.db` (clean
  start for each machine). Uncomment the line in `setup.iss` if you want to
  seed it.
- Everything here is Windows-only (`--app` mode via Chrome/Edge, `.ps1`,
  Inno Setup). Non-Windows falls back to opening the default browser.
