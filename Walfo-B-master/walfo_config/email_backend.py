import os
import requests
from django.core.mail.backends.base import BaseEmailBackend
from django.core.mail.backends.smtp import EmailBackend as SmtpEmailBackend


class UniversalHttpEmailBackend(BaseEmailBackend):
    """
    HTTP-based Email Backend for Render and cloud hosts.
    Bypasses port 25/465/587 blocks by sending via HTTPS (Port 443).
    Supports Resend and Brevo (Sendinblue) APIs.
    Falls back to SMTP with a strict 5-second timeout to prevent server hangs.
    """

    def send_messages(self, email_messages):
        if not email_messages:
            return 0

        resend_api_key = os.environ.get('RESEND_API_KEY', '').strip()
        brevo_api_key = os.environ.get('BREVO_API_KEY', '').strip()

        sent_count = 0
        for msg in email_messages:
            subject = msg.subject
            body = msg.body
            from_email = msg.from_email or os.environ.get('DEFAULT_FROM_EMAIL', 'walfowallet@gmail.com')
            to_emails = msg.to

            delivered = False

            # 1. Try Resend HTTPS API (Port 443 - Works on Render Free Tier)
            if resend_api_key:
                try:
                    sender = "Walfo <onboarding@resend.dev>"
                    payload = {
                        "from": sender,
                        "to": to_emails,
                        "subject": subject,
                        "text": body
                    }
                    resp = requests.post(
                        "https://api.resend.com/emails",
                        headers={
                            "Authorization": f"Bearer {resend_api_key}",
                            "Content-Type": "application/json"
                        },
                        json=payload,
                        timeout=8
                    )
                    if resp.status_code in (200, 201, 202):
                        sent_count += 1
                        delivered = True
                        print(f"[Email Success via Resend] Sent to {to_emails}")
                        continue
                    else:
                        print(f"[Resend API Error] Status {resp.status_code}: {resp.text}")
                except Exception as e:
                    print(f"[Resend Exception] {e}")

            # 2. Try Brevo HTTPS API (Port 443 - Works on Render Free Tier)
            if not delivered and brevo_api_key:
                try:
                    payload = {
                        "sender": {"email": from_email, "name": "Walfo Vault"},
                        "to": [{"email": t} for t in to_emails],
                        "subject": subject,
                        "textContent": body
                    }
                    resp = requests.post(
                        "https://api.brevo.com/v3/smtp/email",
                        headers={
                            "accept": "application/json",
                            "api-key": brevo_api_key,
                            "content-type": "application/json"
                        },
                        json=payload,
                        timeout=8
                    )
                    if resp.status_code in (200, 201, 202):
                        sent_count += 1
                        delivered = True
                        print(f"[Email Success via Brevo] Sent to {to_emails}")
                        continue
                    else:
                        print(f"[Brevo API Error] Status {resp.status_code}: {resp.text}")
                except Exception as e:
                    print(f"[Brevo Exception] {e}")

            # 3. Fallback: SMTP with 5-second timeout (avoids 60s freeze on Render)
            if not delivered:
                try:
                    smtp = SmtpEmailBackend(
                        host=os.environ.get('EMAIL_HOST', 'smtp.gmail.com'),
                        port=int(os.environ.get('EMAIL_PORT', 587)),
                        username=os.environ.get('EMAIL_HOST_USER', ''),
                        password=os.environ.get('EMAIL_HOST_PASSWORD', '').replace(' ', '').strip(),
                        use_tls=True,
                        timeout=5
                    )
                    count = smtp.send_messages([msg])
                    if count > 0:
                        sent_count += count
                        delivered = True
                except Exception as smtp_err:
                    print(f"[SMTP Warning] Port 587 unreachable on this host: {smtp_err}")
                    print(f"[WALFO BACKUP OTP LOG] To: {to_emails} | Subject: {subject} | Content:\n{body}")

        return sent_count
