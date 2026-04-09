# Just Do it.

Focus better.

Strict focus timer + blocker + web dashboard.

## What this project does

- Runs a desktop focus timer.
- Blocks distracting sites and apps during focus mode.
- Requires an unlock challenge for early exit (Hard Math or QR Scan).
- Saves exact session duration in seconds.
- Syncs sessions to Firebase Firestore.
- Shows analytics in a minimal web dashboard.

## Core features

- Hard Math unlock
- QR unlock
- Early termination tracking
- Firebase Authentication login
- Firebase Firestore session history
- Heatmap + session table dashboard

## Tech stack

- Desktop: Python (Tkinter)
- Blocking engine: C++ (Windows)
- Cloud: Firebase Auth + Firestore + Hosting
- Web: HTML + CSS + Vanilla JS

## Project structure

```text
just_do_it.py               # desktop app
engine.cpp                  # native blocker engine
installer/JustDoIt.iss      # installer config
web/index.html              # dashboard UI
web/dashboard.js            # dashboard logic
.github/workflows/release.yml  # release build pipeline
firebase.json               # firebase hosting config
```

## Run locally

1. Build `engine.cpp` into `engine.exe`.
2. Run:

```bash
python just_do_it.py
```

3. Login and start focus sessions.

## Dashboard hosting

Live site is deployed on Firebase Hosting.

Deploy command:

```bash
firebase deploy --only hosting --project just-do-it-1fa38
```

## Downloads

Desktop users should download the installer from Releases:

- `JustDoIt-Setup.exe`

Release page:

- https://github.com/letsjoyn/just-do-it/releases

## Note on Windows blocking

If Smart App Control blocks the installer, the long-term fix is code signing.
