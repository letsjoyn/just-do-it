import tkinter as tk
from tkinter import messagebox, simpledialog
import ctypes, random, sys, os, json, smtplib, sqlite3
import threading, webbrowser, functools
import urllib.request, urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler
from email.message import EmailMessage
from datetime import datetime, timezone

try:
    import pygame; HAS_PYGAME = True
except ImportError: HAS_PYGAME = False

# ── IPC ──
def send_ipc(cmd):
    import time
    try:
        with open(r'\\.\pipe\FocusModePipe', 'r+') as f:
            f.write(cmd); f.flush(); time.sleep(0.1)
        return "Sent"
    except Exception as e: return str(e)

# ── Theme ──
BG       = "#0F0F0F"
CARD     = "#1A1A1A"
BORDER   = "#2A2A2A"
TXT      = "#E8E8E8"
TXT2     = "#777777"
BLUE     = "#3B82F6"
RED      = "#EF4444"
GREEN    = "#22C55E"
FONT     = ("Segoe UI", 10)
FONTB    = ("Segoe UI", 10, "bold")

SYNC_FILE = "sync_payload.json"
LOCAL_ARCHIVE_FILE = "local_sessions.json"
DASHBOARD_PORT = 8765
DASHBOARD_URL  = f"http://localhost:{DASHBOARD_PORT}"

# ── Firebase Config ──
FIREBASE_API_KEY = "AIzaSyB6BZ3TixkZunTAchX3EkWlEW-F-QRDXZY"
FIREBASE_PROJECT = "just-do-it-1fa38"

# ── Dashboard Server ──
class DashboardHandler(SimpleHTTPRequestHandler):
    """Serves web/ directory for dashboard + sync_payload.json from project root"""
    def __init__(self, *args, web_dir="", root_dir="", **kwargs):
        self.root_dir = root_dir
        self.web_dir  = web_dir
        super().__init__(*args, directory=web_dir, **kwargs)

    def translate_path(self, path):
        # Serve sync_payload.json from the project root, everything else from web/
        if path == "/sync_payload.json" or path.startswith("/sync_payload.json?"):
            return os.path.join(self.root_dir, "sync_payload.json")
        if path == "/local_sessions.json" or path.startswith("/local_sessions.json?"):
            return os.path.join(self.root_dir, "local_sessions.json")
        return super().translate_path(path)

    def log_message(self, fmt, *args):
        pass  # Silence request logs

    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass  # Browser closed connection early — harmless

def start_dashboard_server():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    web_dir  = os.path.join(root_dir, "web")
    handler  = functools.partial(DashboardHandler, web_dir=web_dir, root_dir=root_dir)
    server   = HTTPServer(("127.0.0.1", DASHBOARD_PORT), handler)
    thread   = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server

class FocusClient:
    def __init__(self, root):
        self.root = root
        self.root.title("Just Do It")
        self.root.geometry("420x740")
        self.root.configure(bg=BG)
        self.root.resizable(False, False)

        if not ctypes.windll.shell32.IsUserAnAdmin():
            messagebox.showerror("Error", "Run as Administrator.")
            sys.exit()

        self.blocked = ["youtube.com","facebook.com","instagram.com","reddit.com","twitter.com",
                        "steam.exe","discord.exe","chrome.exe","msedge.exe"]
        self.total_seconds = 1
        self.seconds_left = 0
        self.is_running = False
        self.unlock_method = "math"  # or "qr"
        
        self.auth_token = None
        self.user_uid = None
        self.user_email = ""

        # Remove local SQLite db usage, we are cloud now.
        if HAS_PYGAME: pygame.mixer.init()
        self.dashboard_server = start_dashboard_server()
        
        # Try to auto-login if token exists
        self.load_local_auth()
        if self.auth_token:
            self.build()
        else:
            self.build_login()

    def save_local_auth(self):
        try:
            with open("auth.json", "w") as f:
                json.dump({"token": self.auth_token, "uid": self.user_uid, "email": self.user_email}, f)
        except: pass

    def load_local_auth(self):
        if os.path.exists("auth.json"):
            try:
                with open("auth.json", "r") as f:
                    data = json.load(f)
                    self.auth_token = data.get("token")
                    self.user_uid = data.get("uid")
                    self.user_email = data.get("email")
            except: pass

    # ── Auth UI ──
    def build_login(self):
        for widget in self.root.winfo_children():
            widget.destroy()

        self.root.configure(bg=BG)
        frame = tk.Frame(self.root, bg=BG)
        frame.place(relx=0.5, rely=0.5, anchor=tk.CENTER)

        tk.Label(frame, text="◆ JDI", font=("Arial", 28, "bold"), fg=BLUE, bg=BG).pack(pady=(0, 5))
        tk.Label(frame, text="Log in to Focus", font=("Segoe UI", 14), fg=TXT, bg=BG).pack(pady=(0, 20))

        tk.Label(frame, text="EMAIL", font=("Segoe UI", 8, "bold"), fg=TXT2, bg=BG).pack(anchor="w")
        self.email_ent = tk.Entry(frame, font=FONT, bg=CARD, fg=TXT, insertbackground=TXT, bd=0, width=30)
        self.email_ent.pack(ipady=8, pady=(0, 15))

        tk.Label(frame, text="PASSWORD", font=("Segoe UI", 8, "bold"), fg=TXT2, bg=BG).pack(anchor="w")
        self.pass_ent = tk.Entry(frame, font=FONT, bg=CARD, fg=TXT, insertbackground=TXT, bd=0, width=30, show="*")
        self.pass_ent.pack(ipady=8, pady=(0, 25))

        btn_frame = tk.Frame(frame, bg=BG)
        btn_frame.pack(fill=tk.X)

        tk.Button(btn_frame, text="LOG IN", font=FONTB, bg=BLUE, fg="#FFF", bd=0, cursor="hand2",
                  command=lambda: self.do_auth("login")).pack(side=tk.LEFT, expand=True, fill=tk.X, padx=(0,5), ipady=8)
        
        tk.Button(btn_frame, text="SIGN UP", font=FONTB, bg=CARD, fg=TXT, bd=0, cursor="hand2",
                  command=lambda: self.do_auth("signup")).pack(side=tk.RIGHT, expand=True, fill=tk.X, padx=(5,0), ipady=8)

        self.auth_msg = tk.Label(frame, text="", font=("Segoe UI", 9), fg=RED, bg=BG)
        self.auth_msg.pack(pady=10)

    def do_auth(self, mode):
        email = self.email_ent.get().strip()
        pwd = self.pass_ent.get().strip()
        if not email or not pwd:
            self.auth_msg.config(text="Email and password required.")
            return

        self.auth_msg.config(text="Authenticating...", fg=TXT2)
        self.root.update()

        url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"
        if mode == "signup":
            url = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={FIREBASE_API_KEY}"

        data = json.dumps({"email": email, "password": pwd, "returnSecureToken": True}).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})

        def _req():
            try:
                with urllib.request.urlopen(req) as resp:
                    res = json.loads(resp.read().decode())
                    self.auth_token = res["idToken"]
                    self.user_uid = res["localId"]
                    self.user_email = res["email"]
                    self.save_local_auth()
                    self.root.after(0, self.build)
            except urllib.error.HTTPError as e:
                try: err = json.loads(e.read().decode())["error"]["message"]
                except: err = str(e)
                self.root.after(0, lambda: self.auth_msg.config(text=err.replace("_", " "), fg=RED))
            except Exception as e:
                self.root.after(0, lambda: self.auth_msg.config(text=f"Error: {e}", fg=RED))

        threading.Thread(target=_req, daemon=True).start()

    def logout(self):
        self.auth_token = None
        self.user_uid = None
        self.user_email = ""
        if os.path.exists("auth.json"):
            try: os.remove("auth.json")
            except: pass
        self.build_login()

    def log_session(self, mins):
        self.sync_to_cloud(mins)

    def sync_to_cloud(self, mins):
        st_data = {}
        if os.path.exists("screen_time.log"):
            try:
                with open("screen_time.log", 'r', encoding='utf-8', errors='ignore') as f:
                    for line in f:
                        if "] " in line:
                            t = line.split("] ", 1)[1].strip()
                            if t and "Program Manager" not in t:
                                if len(t) > 40: t = t[:37]+"..."
                                st_data[t] = st_data.get(t, 0) + 2
                os.remove("screen_time.log")
            except: pass

        # Load any previous offline sessions to sync as well
        local_list = []
        try:
            if os.path.exists(SYNC_FILE):
                with open(SYNC_FILE, "r") as f: local_list = json.load(f)
        except: pass

        current_session = {
            "date": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "minutes": mins,
            "unlock_method": self.unlock_method,
            "blocked_items": self.blocked,
            "screen_time": st_data
        }
        local_list.append(current_session)

        # Keep a durable local archive even after cloud sync succeeds.
        try:
            archive = []
            if os.path.exists(LOCAL_ARCHIVE_FILE):
                with open(LOCAL_ARCHIVE_FILE, "r") as f:
                    archive = json.load(f)
            archive.append(current_session)
            with open(LOCAL_ARCHIVE_FILE, "w") as f:
                json.dump(archive, f, indent=2)
        except: pass

        # Save all locally just in case
        try:
            with open(SYNC_FILE, "w") as f: json.dump(local_list, f, indent=2)
        except: pass

        if not self.user_uid or not self.auth_token: return

        def _push():
            success_count = 0
            for session in list(local_list): # iterate copy
                # Build Firestore payload for each session
                payload = {
                    "fields": {
                        "date": {"stringValue": session["date"]},
                        "minutes": {"integerValue": str(session["minutes"])},
                        "unlock_method": {"stringValue": session["unlock_method"]},
                        "blocked_items": {"arrayValue": {"values": [{"stringValue": b} for b in session["blocked_items"]]}},
                    }
                }
                
                if session.get("screen_time"):
                    fields = {}
                    for app, secs in session["screen_time"].items():
                        fields[app] = {"integerValue": str(secs)}
                    payload["fields"]["screen_time"] = {"mapValue": {"fields": fields}}

                try:
                    # Deterministic ID based on time to avoid duplicates
                    ts = int(datetime.fromisoformat(session["date"].replace("Z", "+00:00")).timestamp())
                    session_id = f"s_{ts}"
                    
                    url = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT}/databases/(default)/documents/users/{self.user_uid}/sessions/{session_id}?key={FIREBASE_API_KEY}"
                    
                    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.auth_token}"
                    }, method="PATCH")
                    
                    with urllib.request.urlopen(req) as resp:
                        success_count += 1
                        local_list.remove(session) # remove successful 
                except Exception as e:
                    print(f"Failed to sync session: {e}")
                    break # stop trying if offline
            
            if success_count > 0:
                print(f"[Sync] Synced {success_count} sessions to cloud!")
            
            # Re-write remaining (failed) items, or delete file if empty
            if len(local_list) == 0:
                if os.path.exists(SYNC_FILE):
                    try: os.remove(SYNC_FILE)
                    except: pass
            else:
                try:
                    with open(SYNC_FILE, "w") as f: json.dump(local_list, f, indent=2)
                except: pass

        threading.Thread(target=_push, daemon=True).start()

    # ── UI ──
    def build(self):
        for widget in self.root.winfo_children():
            widget.destroy()

        # Header
        hdr = tk.Frame(self.root, bg=CARD, height=50)
        hdr.pack(fill=tk.X)
        hdr.pack_propagate(False)
        tk.Label(hdr, text="◆ JUST DO IT", font=("Segoe UI",13,"bold"), fg=TXT, bg=CARD).pack(side=tk.LEFT, padx=15)
        
        right_frame = tk.Frame(hdr, bg=CARD)
        right_frame.pack(side=tk.RIGHT, padx=15)
        self.dashboard_btn = tk.Button(right_frame, text="Dashboard", font=("Segoe UI",8,"bold"), bg=BG, fg=BLUE, bd=0, cursor="hand2", 
                  command=lambda: webbrowser.open("http://localhost:8765"))
        self.dashboard_btn.pack(side=tk.LEFT, padx=5, ipady=2)
        self.logout_btn = tk.Button(right_frame, text="Log Out", font=("Segoe UI",8,"bold"), bg=BG, fg=RED, bd=0, cursor="hand2", 
                  command=self.logout)
        self.logout_btn.pack(side=tk.LEFT, ipady=2)

        # ── Timer Section ──
        timer_card = tk.Frame(self.root, bg=CARD, highlightbackground=BORDER, highlightthickness=1)
        timer_card.pack(fill=tk.X, padx=15, pady=(15,10))

        self.canvas = tk.Canvas(timer_card, width=200, height=200, bg=CARD, highlightthickness=0)
        self.canvas.pack(pady=20)
        self.canvas.create_oval(15,15,185,185, outline=BORDER, width=3)
        self.arc = self.canvas.create_arc(15,15,185,185, start=90, extent=359.99, outline=BLUE, width=3, style=tk.ARC)
        self.time_text = self.canvas.create_text(100,100, text="60:00", font=("Segoe UI",36,"bold"), fill=TXT)

        # Duration
        dur = tk.Frame(timer_card, bg=CARD)
        dur.pack(pady=(0,5))
        tk.Label(dur, text="Duration:", font=FONT, fg=TXT2, bg=CARD).pack(side=tk.LEFT, padx=5)
        
        self.hr_entry = tk.Entry(dur, font=FONT, width=3, justify="center", bg=BG, fg=TXT, bd=0, insertbackground=TXT)
        self.hr_entry.insert(0, "1")
        self.hr_entry.pack(side=tk.LEFT)
        tk.Label(dur, text="h", font=FONT, fg=TXT2, bg=CARD).pack(side=tk.LEFT, padx=(2,10))
        
        self.min_entry = tk.Entry(dur, font=FONT, width=3, justify="center", bg=BG, fg=TXT, bd=0, insertbackground=TXT)
        self.min_entry.insert(0, "0")
        self.min_entry.pack(side=tk.LEFT)
        tk.Label(dur, text="m", font=FONT, fg=TXT2, bg=CARD).pack(side=tk.LEFT, padx=(2,5))

        # Unlock method selection
        method_frame = tk.Frame(timer_card, bg=CARD)
        method_frame.pack(pady=10)
        tk.Label(method_frame, text="Unlock Penalty:", font=FONT, fg=TXT2, bg=CARD).pack(side=tk.LEFT, padx=5)
        self.method_var = tk.StringVar(value="math")
        tk.Radiobutton(method_frame, text="Hard Math", variable=self.method_var, value="math",
                       fg=TXT, bg=CARD, selectcolor=BG, activebackground=CARD, activeforeground=TXT,
                       font=FONT).pack(side=tk.LEFT, padx=5)
        tk.Radiobutton(method_frame, text="QR Code", variable=self.method_var, value="qr",
                       fg=TXT, bg=CARD, selectcolor=BG, activebackground=CARD, activeforeground=TXT,
                       font=FONT).pack(side=tk.LEFT, padx=5)

        # Buttons
        btns = tk.Frame(timer_card, bg=CARD)
        btns.pack(pady=(5,15))
        self.start_btn = tk.Button(btns, text="START FOCUS", font=FONTB, bg=BLUE, fg="#FFF",
                                   bd=0, width=14, pady=6, cursor="hand2", command=self.pre_start)
        self.start_btn.pack(side=tk.LEFT, padx=5)
        self.stop_btn = tk.Button(btns, text="TERMINATE", font=FONTB, bg=BG, fg=RED,
                                  bd=1, width=14, pady=6, cursor="hand2", command=self.terminate,
                                  state=tk.DISABLED)
        self.stop_btn.pack(side=tk.LEFT, padx=5)

        # ── Audio ──
        tk.Button(timer_card, text="♪ Ambient Audio (Web Stream)", font=FONT, bg=BG, fg=TXT, bd=1,
                  cursor="hand2", command=self.play_lofi).pack(pady=(5,10), ipady=4, fill=tk.X, padx=20)

        # ── Blocked List ──
        list_card = tk.Frame(self.root, bg=CARD, highlightbackground=BORDER, highlightthickness=1)
        list_card.pack(fill=tk.BOTH, expand=True, padx=15, pady=(0,10))

        tk.Label(list_card, text="Blocked Sites & Apps", font=FONTB, fg=TXT, bg=CARD).pack(anchor="w", padx=12, pady=(10,5))

        self.listbox = tk.Listbox(list_card, font=("Consolas",10), bg=BG, fg=RED, bd=0,
                                  selectbackground=BORDER, highlightthickness=0, height=8)
        self.listbox.pack(fill=tk.BOTH, expand=True, padx=12, pady=(0,5))
        for item in self.blocked:
            self.listbox.insert(tk.END, f"  ✕  {item}")

        add_frame = tk.Frame(list_card, bg=CARD)
        add_frame.pack(fill=tk.X, padx=12, pady=(0,10))
        self.add_entry = tk.Entry(add_frame, font=FONT, bg=BG, fg=TXT, bd=0, insertbackground=TXT)
        self.add_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=4)
        tk.Button(add_frame, text="+ ADD", font=("Segoe UI",9,"bold"), bg=GREEN, fg="#FFF",
                  bd=0, padx=10, command=self.add_item, cursor="hand2").pack(side=tk.LEFT, padx=(5,0))
        tk.Button(add_frame, text="− DEL", font=("Segoe UI",9,"bold"), bg=RED, fg="#FFF",
                  bd=0, padx=10, command=self.del_item, cursor="hand2").pack(side=tk.LEFT, padx=(5,0))

    def add_item(self):
        val = self.add_entry.get().strip().lower()
        if val and val not in self.blocked:
            self.blocked.append(val)
            self.listbox.insert(tk.END, f"  ✕  {val}")
        self.add_entry.delete(0, tk.END)

    def del_item(self):
        sel = self.listbox.curselection()
        if sel:
            idx = sel[0]
            self.blocked.pop(idx)
            self.listbox.delete(idx)

    # ── Pre-start flow ──
    def pre_start(self):
        try:
            h = self.hr_entry.get().strip() or "0"
            m = self.min_entry.get().strip() or "0"
            mins = int(h) * 60 + int(m)
            if mins <= 0: raise ValueError
        except:
            return messagebox.showerror("Error", "Enter valid duration.")

        self.unlock_method = self.method_var.get()

        if self.unlock_method == "qr":
            # Automatically use the logged-in user email
            email = self.user_email
            if not email:
                email = simpledialog.askstring("QR Unlock Setup", "Enter your email to receive the QR code:")
                if not email: return
                self.user_email = email

            # Generate QR
            try:
                import qrcode
                qr = qrcode.QRCode()
                qr.add_data("UNLOCK_FOCUS")
                qr.make()
                qr.make_image(fill="black", back_color="white").save("secret_unlock_qr.png")
            except ImportError:
                messagebox.showerror("Missing", "Install qrcode: pip install qrcode[pil]")
                return

            # Show QR on screen
            qr_win = tk.Toplevel(self.root)
            qr_win.title("Save this QR Code!")
            qr_win.geometry("320x400")
            qr_win.configure(bg=CARD)
            qr_win.attributes("-topmost", True)

            tk.Label(qr_win, text="📸 Take a photo of this QR!", font=("Segoe UI",14,"bold"),
                     fg=TXT, bg=CARD).pack(pady=15)
            tk.Label(qr_win, text="You will need to scan this\nwith your webcam to unlock early.",
                     font=FONT, fg=TXT2, bg=CARD).pack()

            try:
                from PIL import Image, ImageTk
                img = Image.open("secret_unlock_qr.png").resize((200,200))
                photo = ImageTk.PhotoImage(img)
                lbl = tk.Label(qr_win, image=photo, bg=CARD)
                lbl.image = photo
                lbl.pack(pady=15)
            except ImportError:
                tk.Label(qr_win, text="[QR saved as secret_unlock_qr.png]\nOpen it manually to photograph.",
                         font=FONT, fg=RED, bg=CARD).pack(pady=15)
                try: os.startfile("secret_unlock_qr.png")
                except: pass

            def proceed():
                qr_win.destroy()
                # Check for App Password before jumping into the background thread
                sender_pass = getattr(self, "smtp_pass", None)
                if not sender_pass:
                     import base64
                     enc = b'cWtjemtmZmxubnBjaWVsZg=='
                     sender_pass = os.environ.get("JUSTDOIT_EMAIL_PASS", base64.b64decode(enc).decode('utf-8'))
                
                self.send_qr_email(email, sender_pass)
                self.actually_start(mins)

            tk.Button(qr_win, text="I SAVED IT → START TIMER", font=FONTB, bg=BLUE, fg="#FFF",
                      bd=0, pady=8, cursor="hand2", command=proceed).pack(fill=tk.X, padx=20, pady=10)
        else:
            # Math mode - just start directly
            self.actually_start(mins)

    def send_qr_email(self, receiver, sender_pass):
        """Send QR unlock email in a background thread so it doesn't block the UI"""
        def _send():
            SENDER_EMAIL = os.environ.get("JUSTDOIT_EMAIL", "joynnayvedya@gmail.com")
            SENDER_PASS  = sender_pass
            try:
                msg = EmailMessage()
                msg['Subject'] = 'Unlock Authorization - Just Do It'
                msg['From'] = f"Just Do It <{SENDER_EMAIL}>"
                msg['To'] = receiver
                msg.set_content("Scan the attached QR code to unlock.")

                html = f"""<html><body style="font-family:Segoe UI;background:{BG};padding:30px;margin:0;">
                <div style="max-width:400px;margin:0 auto;background:{CARD};border-radius:10px;border:1px solid {BORDER};overflow:hidden;">
                <div style="background:{BLUE};padding:16px;text-align:center;"><h2 style="margin:0;color:#FFF;">Just Do It</h2></div>
                <div style="padding:24px;text-align:center;color:{TXT};">
                <h3 style="color:{TXT};">Unlock Authorization</h3>
                <p style="color:{TXT2};">Scan the attached QR with your webcam to end focus early.</p>
                <p style="color:{GREEN};font-style:italic;">"Stay focused. Stay sharp."</p>
                </div></div></body></html>"""
                msg.add_alternative(html, subtype='html')

                with open("secret_unlock_qr.png",'rb') as f:
                    msg.add_attachment(f.read(), maintype='image', subtype='png', filename='unlock_qr.png')

                import ssl
                ctx = ssl.create_default_context()

                # Try TLS on port 587 first, then SSL on 465
                sent = False
                for attempt in range(2):
                    try:
                        if attempt == 0:
                            s = smtplib.SMTP("smtp.gmail.com", 587, timeout=20)
                            s.ehlo("localhost")
                            s.starttls(context=ctx)
                            s.ehlo("localhost")
                        else:
                            s = smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20, context=ctx)
                        s.login(SENDER_EMAIL, SENDER_PASS)
                        s.send_message(msg)
                        s.quit()
                        sent = True
                        break
                    except Exception as smtp_err:
                        print(f"[Email] Attempt {attempt+1} failed: {smtp_err}")
                        try: s.quit()
                        except: pass

                if sent:
                    self.root.after(0, lambda: messagebox.showinfo("Sent", f"QR emailed to {receiver}"))
                else:
                    self.root.after(0, lambda: messagebox.showwarning("Email Failed",
                        f"Could not connect to Gmail.\nCheck your App Password in Google Account settings.\nUse the QR photo you took instead."))
            except Exception as e:
                print(f"[Email] Error: {e}")
                self.root.after(0, lambda: messagebox.showwarning("Email Failed",
                    f"Couldn't send email: {e}\nUse the photo you took instead."))

        threading.Thread(target=_send, daemon=True).start()

    def actually_start(self, mins):
        self.total_seconds = mins * 60
        self.seconds_left = self.total_seconds
        self.initial_mins = mins
        self.is_running = True

        self.hr_entry.config(state=tk.DISABLED)
        self.min_entry.config(state=tk.DISABLED)
        self.start_btn.config(state=tk.DISABLED, bg=BORDER, fg=TXT2)
        self.stop_btn.config(state=tk.NORMAL)
        self.dashboard_btn.config(state=tk.DISABLED)
        self.logout_btn.config(state=tk.DISABLED)

        err = send_ipc(f"START {mins}")
        if "No such file" in err:
            messagebox.showwarning("Engine", "C++ Engine offline. Website/app blocking disabled.")

        self.draw_clock()
        self.timer_tick()

    def draw_clock(self):
        h, rem = divmod(self.seconds_left, 3600)
        m, s = divmod(rem, 60)
        if h > 0:
            self.canvas.itemconfig(self.time_text, text=f"{h}:{m:02d}:{s:02d}", font=("Segoe UI", 26, "bold"))
        else:
            self.canvas.itemconfig(self.time_text, text=f"{m:02d}:{s:02d}", font=("Segoe UI", 36, "bold"))
        frac = self.seconds_left / self.total_seconds
        ext = -(frac * 359.99) if frac > 0 else 0.01
        self.canvas.itemconfig(self.arc, extent=ext)

    def timer_tick(self):
        if self.is_running and self.seconds_left > 0:
            self.seconds_left -= 1
            self.draw_clock()
            self.root.after(1000, self.timer_tick)
        elif self.seconds_left == 0 and self.is_running:
            self.finish()

    def finish(self):
        self.is_running = False
        self.reset_ui()
        self.log_session(self.initial_mins)
        send_ipc("UNLOCK")
        self.open_dashboard()
        messagebox.showinfo("Done", f"Session complete! {self.initial_mins} min logged.\nDashboard opened in browser.")

    # ── Terminate (uses pre-selected method) ──
    def terminate(self):
        if self.unlock_method == "qr":
            self.do_qr_scan()
        else:
            self.do_hard_math()

    def do_hard_math(self):
        win = tk.Toplevel(self.root)
        win.title("Math Challenge")
        win.geometry("320x220")
        win.configure(bg=CARD)
        win.attributes("-topmost", True)

        # Generate HARD math (3 numbers)
        a, b, c = random.randint(13,49), random.randint(7,29), random.randint(2,9)
        answer = str(a * b + c)
        tk.Label(win, text="Solve to unlock:", font=FONTB, fg=TXT, bg=CARD).pack(pady=(20,10))
        tk.Label(win, text=f"{a} × {b} + {c} = ?", font=("Segoe UI",20,"bold"), fg=BLUE, bg=CARD).pack()

        ent = tk.Entry(win, font=("Segoe UI",16), justify="center", bg=BG, fg=TXT, bd=0, insertbackground=TXT, width=10)
        ent.pack(pady=15)
        ent.focus()

        def check():
            if ent.get().strip() == answer:
                win.destroy()
                mins_done = self.initial_mins - (self.seconds_left // 60)
                if mins_done > 0: self.log_session(mins_done)
                self.is_running = False
                self.reset_ui()
                send_ipc("UNLOCK")
                self.open_dashboard()
            else:
                messagebox.showerror("Wrong", "Incorrect. Try again.", parent=win)
                ent.delete(0, tk.END)

        tk.Button(win, text="SUBMIT", font=FONTB, bg=BLUE, fg="#FFF", bd=0, pady=6,
                  width=12, command=check, cursor="hand2").pack()

    def do_qr_scan(self):
        try: import cv2
        except ImportError:
            messagebox.showerror("Missing", "Install opencv: pip install opencv-python")
            return

        self.root.iconify()  # Minimize main window
        cap = cv2.VideoCapture(0)
        det = cv2.QRCodeDetector()

        while True:
            ret, frame = cap.read()
            if not ret: break
            data, _, _ = det.detectAndDecode(frame)
            if data == "UNLOCK_FOCUS":
                cap.release(); cv2.destroyAllWindows()
                self.root.deiconify()
                mins_done = self.initial_mins - (self.seconds_left // 60)
                if mins_done > 0: self.log_session(mins_done)
                self.is_running = False
                self.reset_ui()
                send_ipc("UNLOCK")
                self.open_dashboard()
                messagebox.showinfo("Unlocked", "QR verified. Session ended. Dashboard opened.")
                return
            cv2.putText(frame, "Show UNLOCK QR to camera | Q to cancel", (10,30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,120,255), 2)
            cv2.imshow("QR Scanner - Just Do It", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'): break

        cap.release(); cv2.destroyAllWindows()
        self.root.deiconify()

    def open_dashboard(self):
        """Open the stats dashboard in the default browser"""
        webbrowser.open(DASHBOARD_URL)

    def reset_ui(self):
        self.canvas.itemconfig(self.time_text, text="60:00", font=("Segoe UI", 36, "bold"))
        self.canvas.itemconfig(self.arc, extent=359.99)
        self.hr_entry.config(state=tk.NORMAL)
        self.min_entry.config(state=tk.NORMAL)
        self.start_btn.config(state=tk.NORMAL, bg=BLUE, fg="#FFF")
        self.stop_btn.config(state=tk.DISABLED)
        self.dashboard_btn.config(state=tk.NORMAL)
        self.logout_btn.config(state=tk.NORMAL)

    def play_lofi(self):
        # Open LofiGirl's official site (not YouTube, so it bypasses our blocklist)
        try:
            webbrowser.open("https://lofigirl.com/")
        except:
            pass

def start_engine_subprocess():
    import subprocess, atexit
    base_path = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    engine_path = os.path.join(base_path, "engine.exe")
    if os.path.exists(engine_path):
        proc = subprocess.Popen([engine_path], creationflags=subprocess.CREATE_NO_WINDOW)
        atexit.register(proc.terminate)

if __name__ == "__main__":
    start_engine_subprocess()
    root = tk.Tk()
    app = FocusClient(root)
    root.mainloop()
