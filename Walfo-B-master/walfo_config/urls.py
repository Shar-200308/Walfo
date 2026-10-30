"""
URL configuration for walfo_config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
import os
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse


def health_check(request):
    db_status = "connected"
    try:
        from users.models import User
        user_count = User.objects.count()
        db_status = f"connected (users_count={user_count})"
    except Exception as e:
        db_status = f"database error: {str(e)}"

    resend_key = os.environ.get('RESEND_API_KEY', '').strip()

    return JsonResponse({
        "status": "healthy" if "error" not in db_status else "unhealthy",
        "service": "Walfo API",
        "database": db_status,
        "resend_key_configured": bool(resend_key),
    })


def test_email(request):
    import requests
    key = os.environ.get('RESEND_API_KEY', '').strip()
    if not key:
        return JsonResponse({
            "status": False,
            "message": "RESEND_API_KEY is not set in Render Environment Variables!"
        })

    to_email = request.GET.get('to', 'sharan2003murali@gmail.com')
    try:
        resp = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json"
            },
            json={
                "from": "Walfo <onboarding@resend.dev>",
                "to": [to_email],
                "subject": "Walfo Live Test Email",
                "text": "Hello Sharan! This is a test email sent from Walfo on Render via Resend."
            },
            timeout=10
        )
        return JsonResponse({
            "status": resp.status_code in (200, 201, 202),
            "status_code": resp.status_code,
            "sent_to": to_email,
            "resend_response": resp.json() if resp.headers.get('content-type', '').startswith('application/json') else resp.text
        })
    except Exception as e:
        return JsonResponse({"status": False, "error": str(e)})


urlpatterns = [
    path('', health_check, name='health_check'),
    path('test-email/', test_email, name='test_email'),
    path('admin/', admin.site.urls),
    path('user/', include('users.urls')),
]

