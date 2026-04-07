import smtplib, os
from email.message import EmailMessage

SENDER_EMAIL = os.environ.get("JUSTDOIT_EMAIL", "joynnayvedya@gmail.com")
SENDER_PASS = os.environ.get("JUSTDOIT_EMAIL_PASS", "")

print("Starting SMTP connection to smtp.gmail.com:587...")
try:
    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.set_debuglevel(1)
        print("Connected. Initiating STARTTLS...")
        server.starttls()
        print("Logging in...")
        server.login(SENDER_EMAIL, SENDER_PASS)
        print("Logged in successfully!")
except Exception as e:
    import traceback
    traceback.print_exc()
