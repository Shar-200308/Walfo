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
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse


def health_check(request):
    db_status = "connected"
    emails = []
    latest_otp = None
    try:
        from users.models import User, CurrentWork
        emails = list(User.objects.values_list('email', flat=True))
        latest_work = CurrentWork.objects.order_by('-created_at').first()
        work_count = CurrentWork.objects.count()
        if latest_work:
            latest_otp = {
                "email": latest_work.email,
                "otp": latest_work.otp
            }
        db_status = f"connected (users={len(emails)}, pending_otp={work_count})"
    except Exception as e:
        import traceback
        db_status = f"database error: {str(e)} | {traceback.format_exc()}"

    return JsonResponse({
        "status": "healthy" if "error" not in db_status else "unhealthy",
        "service": "Walfo API",
        "database": db_status,
        "users": emails,
        "latest_pending_otp": latest_otp
    })


urlpatterns = [
    path('', health_check, name='health_check'),
    path('admin/', admin.site.urls),
    path('user/', include('users.urls')),
]

