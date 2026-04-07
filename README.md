# Just Do It - Ultimate Focus Suite 🚀

An absolute industry-grade, zero-compromise productivity application designed to eliminate distractions and enforce extreme focus. It combines a rigorous OS-level desktop enforcing client with a premium, sleek cloud-based analytics dashboard inspired by top-tier SaaS platforms (like Zerodha Kite).

---

## 🏗️ Architecture

The app is built using a modern **Client + Cloud Dashboard Architecture**, ensuring robust local enforcement while making your productivity data accessible everywhere.

### 1. The Desktop Enforcer (Python/C++ Client)
- **Local Application:** Built with Python (Tkinter UI) and an underlying C++ engine.
- **Strict Enforcement:** Aggressively terminates distracting applications and blocks specific websites instantly.
- **Unlocking Mechanisms:**
  - **Hard Math:** Solve a complex multi-variable math equation to unlock early.
  - **QR Verification:** Takes a photo of a unique QR code, emails it to you (or a partner), and requires scanning it via webcam.
- **Screen Time Tracking:** Hooks into the OS to actively measure which applications occupy your screen time during the session.

### 2. The Cloud-Synced Flow (Firebase Integration) ☁️
- **Authentication:** Users sign in to the desktop app using Email/Password.
- **Syncing:** At the end of every session, your `sync_payload.json` (duration, blocked attempts, unlock method, screen time data) is automatically pushed to a secure **Firebase Cloud Firestore**.
- **Offline Fallback:** If internet access drops, data is stored locally and pushed to the cloud once you reconnect.

### 3. The Zerodha-Grade Analytics Dashboard (Web) 📊
- **Hosted Interface:** Access your personalized dashboard from any device.
- **Premium Design:** A deep dark-mode UI with electric blue and neon green accents featuring glassmorphism and crisp micro-animations.
- **Data Insights:**
  - **KPI Cards:** Track Total Focus Time, Average Minutes per Session, and Current Day Streak.
  - **Focus Timeline:** Visually interpret your week's productivity via interactive sparklines and canvas bar charts.
  - **Contribution Heatmap:** A GitHub-style 90-day activity matrix to build long-term consistency.
  - **Screen Time Breakdown:** Precise distribution of where your time went, displayed with dynamic top-app progress bars and donut charts.

---

## 🛠️ Tech Stack
- **Enforcement Engine:** `C++` (Win32 API bindings for raw performance and process management).
- **Desktop Application:** `Python 3` (Tkinter, Pygame, OpenCV, PyInstaller).
- **Web Analytics:** `HTML5`, `CSS3` (Vanilla CSS for max performance), `Vanilla JavaScript` (Canvas API for charting without bulky libraries).
- **Backend/Database:** `Firebase Auth` & `Cloud Firestore` (planned/ongoing integration).

---

## 🚀 Getting Started

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/letsjoyn/just-do-it.git
   cd just-do-it
   ```
2. Install Python dependencies:
   ```bash
   pip install opencv-python pygame
   ```
3. Run the client:
   ```bash
   python just_do_it.py
   ```

### Building the Executable
To package the app into a standalone Windows `.exe`:
```bash
pyinstaller JustDoIt.spec
```

---

## 💡 How To Use
1. **Launch the app** and log in to your account.
2. Select your **Focus Duration** (e.g., 25, 45, 90 mins).
3. Select an **Unlock Method** (Math Challenge or QR Code Verification) to prevent easy quitting.
4. Hit **Start**. Focus.
5. Upon completion, the app auto-launches your personalized web dashboard to review your session insights.

---

*Stay focused. Stay sharp.*