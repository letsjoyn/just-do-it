# Just Do it.

Focus better.

This project is a strict focus suite with:

- a desktop timer app,
- a native Windows blocker engine,
- cloud sync to Firebase,
- and a web dashboard.

## Main features

- Hard Math unlock challenge
- QR unlock challenge
- Early termination tracking
- Exact duration tracking in seconds
- Website and app blocking during focus
- Firebase Auth login
- Firestore session storage
- Dashboard heatmap and session table

## Project structure

```text
just_do_it.py               # desktop app entry point
engine.cpp                  # C++ blocking engine source
engine.exe                  # compiled blocker engine
web/index.html              # dashboard UI
web/dashboard.js            # dashboard logic
web/output-onlinepngtools.png
firebase.json               # firebase hosting config
.firebaserc                # firebase project mapping
```

## End-user usage (what normal users do)

Users only need to run the app and sign up/login. They do not deploy Firebase.

### 1. Open the app

Run:

```powershell
py just_do_it.py
```

### 2. Sign up or login

Use your email and password in the app.

### 3. Start using focus mode

1. Set duration.
2. Choose unlock method (Hard Math or QR).
3. Click Start.
4. Open Dashboard when needed.

## Manual setup (for advanced users / local run)

Use this method if someone is running the project from source.

### 1. Install prerequisites

- Windows 10/11
- Python 3.10+ (with `py` command available)
- Git (optional, but recommended)
- Firebase CLI (only needed if deploying dashboard)

### 2. Get the code

Option A: clone with git

```powershell
git clone https://github.com/letsjoyn/just-do-it.git
cd just-do-it
```

Option B: download ZIP from GitHub source and extract.

### 3. Install Python dependencies

Run in project root:

```powershell
py -m pip install --upgrade pip
py -m pip install qrcode[pil] opencv-python pygame
```

Notes:

- `qrcode[pil]` is needed for QR unlock generation.
- `opencv-python` is needed for webcam QR scan.
- `pygame` is optional for audio features, but recommended.

### 4. Run as Administrator

The blocker engine edits hosts and manages processes, so admin rights are required.

Open terminal as Administrator, then:

```powershell
cd path\to\just-do-it
py just_do_it.py
```

### 5. Use the app

1. Log in or sign up in desktop app.
2. Set duration.
3. Choose unlock method (Hard Math or QR).
4. Start focus mode.
5. Click Dashboard to view analytics.

## Dashboard (web)

### Live hosted URL

```text
https://just-do-it-1fa38.web.app
```

### Deploy updates to Firebase Hosting (maintainer only)

```powershell
firebase login
firebase use just-do-it-1fa38
firebase deploy --only hosting
```

## Data model (session fields)

Each session contains:

- `date`
- `duration_seconds`
- `early_terminated`
- `unlock_method`
- `blocked_items`
- `screen_time`

## Local files generated at runtime

These are created automatically while using the app:

- `auth.json` (local auth cache)
- `sync_payload.json` (pending sync queue)
- `local_sessions.json` (local archive)
- `screen_time.log` (window activity samples)
- `secret_unlock_qr.png` (generated QR)

They should not be committed.

## Troubleshooting

### Smart App Control blocks downloads

Use the manual Python run method above instead of unsigned installer binaries.

### Dashboard login works but no data

- Check Firebase Auth account used in app and website is the same.
- Check Firestore rules allow authenticated reads/writes.

### Release/Actions failures

Release automation has been removed to avoid noisy failed deployments. Use manual run or manual packaging.

