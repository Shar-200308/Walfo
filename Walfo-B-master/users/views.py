"""
Walfo – API Views
=================
Organised into three logical sections:
  1. AUTH VIEWS       — registration, login, OTP, credentials, face, password reset
  2. DOCUMENT VIEWS   — upload, list (paginated), delete
  3. SECURITY VIEWS   — validate token, search user, update face, report spoof

Key fixes applied
-----------------
* OTP expiry enforced (OTP_EXPIRY_MINUTES env var, default 10 min)
* All sender addresses use settings.DEFAULT_FROM_EMAIL (no hardcoding)
* Face-match threshold unified at FACE_MATCH_THRESHOLD = 0.58 (matches frontend)
* Face descriptor validated with _validate_descriptor() before use
* getUserDocuments supports ?page=N&page_size=N pagination
* Removed unused imports: render, cache, get_user_model
* UserSerializer no longer exposes face_descriptor / face_image
"""

import os
import random
import json
import base64
import threading
from datetime import timezone, datetime, timedelta
from email.mime.image import MIMEImage

from django.conf import settings
from django.core.mail import send_mail, EmailMultiAlternatives
from django.utils import timezone as django_timezone

from rest_framework import status
from rest_framework.authentication import TokenAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.authtoken.models import Token

from cloudinary.uploader import destroy
import cloudinary.uploader

from users.models import User, CurrentWork, Students_documents
from users.serializers import UserSerializer, DocumentSerializer


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OTP_EXPIRY_MINUTES = int(os.environ.get('OTP_EXPIRY_MINUTES', 10))
FACE_MATCH_THRESHOLD = float(os.environ.get('FACE_MATCH_THRESHOLD', 0.60))   # Euclidean distance; lower = stricter match (default 0.60)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_otp_expired(otp_entry) -> bool:
    """Return True if the OTP is older than OTP_EXPIRY_MINUTES."""
    expiry_cutoff = django_timezone.now() - timedelta(minutes=OTP_EXPIRY_MINUTES)
    return otp_entry.created_at < expiry_cutoff


def _euclidean_distance(a: list, b: list) -> float:
    """Calculate Euclidean distance between two equal-length numeric lists."""
    return sum((float(x) - float(y)) ** 2 for x, y in zip(a, b)) ** 0.5


def _validate_descriptor(descriptor) -> bool:
    """Return True only if descriptor is a list of exactly 128 numeric values."""
    return (
        isinstance(descriptor, list)
        and len(descriptor) == 128
        and all(isinstance(v, (int, float)) for v in descriptor)
    )


def generate_next_user_id():
    last_user = User.objects.filter(user_id__startswith='5555').order_by('-user_id').first()
    if last_user and last_user.user_id:
        next_id = int(last_user.user_id) + 1
    else:
        next_id = 55550001
    return str(next_id).zfill(8)


def _send_email_async(subject: str, message: str, recipient_email: str):
    """Send an email in a background daemon thread so HTTP requests respond in milliseconds."""
    def _worker():
        try:
            print(f"[Walfo OTP Dispatch] Sending '{subject}' to {recipient_email}...")
            print(f"[WALFO BACKUP OTP LOG] Recipient: {recipient_email} | Message: {message.strip()}")
            send_mail(
                subject,
                message,
                settings.DEFAULT_FROM_EMAIL,
                [recipient_email],
                fail_silently=True,
            )
        except Exception as e:
            print(f"[Email Background Send Error]: {e}")

    threading.Thread(target=_worker, daemon=True).start()


# ===========================================================================
# SECTION 1 – AUTH VIEWS
# ===========================================================================

@api_view(['POST'])
@permission_classes([AllowAny])
def createUser(request):
    response_details = {
        "status": False,
        "status_code": 400,
        "message": 'Error happened while processing',
    }
    email = request.data.get('email')
    if not email:
        response_details['message'] = 'Email is required'
        return Response(response_details)

    if User.objects.filter(email=email).exists():
        response_details.update({
            "status": False,
            "status_code": 400,
            "message": "User already exists",
        })
    else:
        CurrentWork.objects.filter(email=email).delete()
        otp = ''.join(random.choices('0123456789', k=4))
        CurrentWork.objects.create(email=email, otp=otp)
        _send_email_async(
            'Your Walfo account verification code',
            f'Your Walfo account verification code is {otp}\n\n'
            f'This code expires in {OTP_EXPIRY_MINUTES} minutes.',
            email
        )

        response_details.update({
            "status": True,
            'status_code': 200,
            'message': 'OTP sent to email for verification',
        })
    return Response(response_details)


@api_view(['POST'])
@permission_classes([AllowAny])
def verifyOtp(request):
    response_details = {
        "status": False,
        "status_code": 400,
        "message": 'Error happened while processing',
    }
    email = request.data.get('email')
    otp = request.data.get('otp')
    name = request.data.get('name')
    password = request.data.get('password')
    face_descriptor = request.data.get('face_descriptor')
    face_image = request.data.get('face_image')

    if not email or not otp or not name or not password:
        response_details['message'] = 'Email, name, password, and OTP are required'
        return Response(response_details)

    try:
        otp_entry = CurrentWork.objects.filter(email=email).order_by('-created_at').first()

        if not otp_entry:
            response_details['message'] = 'OTP not found for this email'
            return Response(response_details)

        # ── Expiry check ────────────────────────────────────────────────────
        if _is_otp_expired(otp_entry):
            otp_entry.delete()
            response_details['message'] = f'OTP has expired. Please request a new one (valid for {OTP_EXPIRY_MINUTES} minutes).'
            return Response(response_details)

        if str(otp_entry.otp) == str(otp):
            if User.objects.filter(email=email).exists():
                response_details['message'] = 'User already exists'
            else:
                descriptor_str = json.dumps(face_descriptor) if face_descriptor is not None else None

                user = User.objects.create_user(
                    email=email,
                    password=password,
                    name=name,
                    user_id=generate_next_user_id(),
                    face_descriptor=descriptor_str,
                    face_image=face_image,
                )
                token, _ = Token.objects.get_or_create(user=user)

                send_mail(
                    'Welcome to Walfo – Your Student Document Vault',
                    f"Hi {name},\n\n"
                    "Thank you for creating an account on Walfo – your trusted vault for securely "
                    "storing and managing student documents.\n"
                    "We're excited to have you on board! You can now upload, access, and organise "
                    "all your important documents in one place.\n\n"
                    "If you have any questions or need support, feel free to reach out.\n\n"
                    "Best regards,\nThe Walfo Team",
                    settings.DEFAULT_FROM_EMAIL,
                    [email],
                    fail_silently=False,
                )
                otp_entry.delete()

                response_details.update({
                    "status": True,
                    "status_code": 200,
                    "message": "OTP verified and account created",
                    "token": token.key,
                    "user_id": user.user_id,
                })
        else:
            response_details['message'] = 'Invalid OTP'

    except Exception as e:
        response_details.update({
            "status_code": 500,
            "message": "Internal server error: " + str(e),
        })

    return Response(response_details)


@api_view(['POST'])
@permission_classes([AllowAny])
def requestOtpWithPassword(request):
    response_details = {
        "status": False,
        "status_code": 400,
        "message": "An error occurred during processing",
    }

    email = request.data.get('email')
    password = request.data.get('password')
    if not email or not password:
        response_details['message'] = 'Email and password are required'
        return Response(response_details)

    try:
        user = User.objects.filter(email=email).first()
        if not user:
            response_details['message'] = 'User does not exist'
            return Response(response_details)
        if not user.check_password(password):
            response_details['message'] = 'Incorrect password'
            return Response(response_details)

        CurrentWork.objects.filter(email=email).delete()
        otp = ''.join(random.choices('0123456789', k=4))
        CurrentWork.objects.create(email=email, otp=otp)
        _send_email_async(
            'Your Walfo OTP Code',
            f'Your login OTP code is: {otp}\n\n'
            f'This code expires in {OTP_EXPIRY_MINUTES} minutes.',
            email
        )

        response_details.update({
            "status": True,
            "status_code": 200,
            "message": "OTP sent to your email",
        })
        return Response(response_details, status=200)

    except Exception as e:
        response_details['status_code'] = 500
        response_details['message'] = f"Internal server error: {str(e)}"
        return Response(response_details, status=500)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_credentials(request):
    email = request.data.get('email')
    password = request.data.get('password')
    if not email or not password:
        return Response({
            "status": False,
            "status_code": 400,
            "message": "Email and password are required",
        })
    user = User.objects.filter(email=email).first()
    if not user:
        return Response({"status": False, "status_code": 400, "message": "User does not exist"})
    if not user.check_password(password):
        return Response({"status": False, "status_code": 400, "message": "Incorrect password"})

    has_face = bool(user.face_descriptor)
    registered_descriptor = None
    if user.face_descriptor:
        try:
            registered_descriptor = json.loads(user.face_descriptor)
        except Exception:
            registered_descriptor = None

    return Response({
        "status": True,
        "status_code": 200,
        "message": "Credentials verified successfully.",
        "has_face": has_face,
        "registered_descriptor": registered_descriptor,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_face_and_send_otp(request):
    email = request.data.get('email')
    password = request.data.get('password')
    input_descriptor = request.data.get('face_descriptor')

    if not email or not password:
        return Response({"status": False, "status_code": 400, "message": "Email and password are required"})

    user = User.objects.filter(email=email).first()
    if not user:
        return Response({"status": False, "status_code": 400, "message": "User does not exist"})
    if not user.check_password(password):
        return Response({"status": False, "status_code": 400, "message": "Incorrect password"})

    # ── New user with no registered face ────────────────────────────────────
    if not user.face_descriptor:
        liveness_confirmed = request.data.get('liveness_confirmed', False)
        if not liveness_confirmed:
            return Response({
                "status": False,
                "status_code": 403,
                "message": "Liveness verification is required before registering your face.",
            })
        # Validate the descriptor is a proper 128-element numeric array
        if not _validate_descriptor(input_descriptor):
            return Response({
                "status": False,
                "status_code": 400,
                "message": "A valid 128-element face descriptor is required for face registration.",
            })

        face_image = request.data.get('face_image')
        if face_image:
            user.face_image = face_image
        user.face_descriptor = json.dumps(input_descriptor)
        user.save()

        CurrentWork.objects.filter(email=email).delete()
        otp = ''.join(random.choices('0123456789', k=4))
        CurrentWork.objects.create(email=email, otp=otp)
        _send_email_async(
            'Your Walfo OTP Code',
            f'Your login OTP code is: {otp}\n\nThis code expires in {OTP_EXPIRY_MINUTES} minutes.',
            email
        )

        return Response({
            "status": True,
            "status_code": 200,
            "message": "Face registered successfully! OTP sent directly to email.",
        })

    # ── Returning user — validate input descriptor first ────────────────────
    if not _validate_descriptor(input_descriptor):
        return Response({
            "status": False,
            "status_code": 400,
            "message": "A valid 128-element face descriptor is required for verification.",
        })

    try:
        registered_descriptor = json.loads(user.face_descriptor)
        if not _validate_descriptor(registered_descriptor):
            return Response({
                "status": False,
                "status_code": 400,
                "message": "Stored face descriptor is invalid. Please update your face via the dashboard.",
            })

        distance = _euclidean_distance(registered_descriptor, input_descriptor)

        if distance < FACE_MATCH_THRESHOLD:
            face_image = request.data.get('face_image')
            if face_image:
                user.face_image = face_image
                user.save()

            CurrentWork.objects.filter(email=email).delete()
            otp = ''.join(random.choices('0123456789', k=4))
            CurrentWork.objects.create(email=email, otp=otp)
            _send_email_async(
                'Your Walfo OTP Code',
                f'Your login OTP code is: {otp}\n\nThis code expires in {OTP_EXPIRY_MINUTES} minutes.',
                email
            )

            return Response({
                "status": True,
                "status_code": 200,
                "message": "Face matched successfully! OTP sent to your email.",
            })
        else:
            _send_mismatch_alert(user, email, request)
            return Response({
                "status": False,
                "status_code": 403,
                "message": "Face doesn't match! Your face was not recognised. "
                           "A security alert has been sent to the account owner.",
            })

    except Exception as e:
        return Response({
            "status": False,
            "status_code": 500,
            "message": f"Error during face verification: {str(e)}",
        })


def _send_mismatch_alert(user, email, request):
    """Send an HTML security-alert email to the account owner on face mismatch."""
    attempt_time = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
    intruder_face_raw = request.data.get('face_image', '')

    intruder_img_bytes = None
    if intruder_face_raw and intruder_face_raw.startswith('data:'):
        try:
            _, b64data = intruder_face_raw.split(',', 1)
            intruder_img_bytes = base64.b64decode(b64data)
        except Exception:
            intruder_img_bytes = None

    face_img_html = (
        '<p><strong>&#128247; Captured face of the person who attempted access:</strong></p>'
        '<img src="cid:intruder_face_mismatch" '
        'style="width:220px;border-radius:10px;border:3px solid #e53e3e;margin-top:6px;" />'
    ) if intruder_img_bytes else '<p><em>No face image was captured during this attempt.</em></p>'

    html_message = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 24px;">
      <div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;
                  border:1px solid #e2e8f0;padding:32px;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
        <h2 style="color:#c53030;margin-top:0;">
          &#9888;&#65039; Unauthorized Login Attempt Detected
        </h2>
        <p style="color:#2d3748;">Hi <strong>{user.name}</strong>,</p>
        <p style="color:#4a5568;">
          We detected an unauthorized attempt to access your <strong>Walfo</strong> account.
          Someone used your email address to try to log in, but their face
          <strong>did not match</strong> your registered face.
        </p>
        <table style="width:100%;background:#fff5f5;border-radius:8px;
                      padding:16px;border:1px solid #feb2b2;margin:16px 0;border-collapse:collapse;">
          <tr>
            <td style="color:#742a2a;font-weight:bold;padding:4px 8px;">&#128337; Time:</td>
            <td style="color:#742a2a;padding:4px 8px;">{attempt_time}</td>
          </tr>
          <tr>
            <td style="color:#742a2a;font-weight:bold;padding:4px 8px;">&#128231; Email Used:</td>
            <td style="color:#742a2a;padding:4px 8px;">{email}</td>
          </tr>
        </table>
        {face_img_html}
        <p style="color:#4a5568;margin-top:24px;">
          <strong>If this was you</strong>, you may safely ignore this email.<br/>
          <strong>If this was NOT you</strong>, we strongly recommend:
        </p>
        <ul style="color:#4a5568;">
          <li>Changing your Walfo password immediately</li>
          <li>Reviewing your recent account activity</li>
          <li>Contacting our support team if you need help</li>
        </ul>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#718096;font-size:13px;">
          This is an automated security notification from the Walfo Security Team.<br/>
          Please do not reply to this email.
        </p>
      </div>
    </body>
    </html>
    """

    plain_message = (
        f'Hi {user.name},\n\n'
        'An unauthorized login attempt was detected on your Walfo account.\n'
        'Someone used your email but their face did not match your registered face.\n\n'
        f'Time: {attempt_time}\n'
        f'Email used: {email}\n\n'
        'If this was NOT you, please change your password immediately.\n\n'
        '\u2014 The Walfo Security Team'
    )

    try:
        msg = EmailMultiAlternatives(
            subject='\u26a0\ufe0f Walfo Security Alert \u2013 Unauthorized Login Attempt',
            body=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[email],
        )
        msg.attach_alternative(html_message, 'text/html')
        if intruder_img_bytes:
            mime_img = MIMEImage(intruder_img_bytes, 'jpeg')
            mime_img.add_header('Content-ID', '<intruder_face_mismatch>')
            mime_img.add_header('Content-Disposition', 'inline', filename='intruder_face.jpg')
            msg.attach(mime_img)
        msg.send(fail_silently=False)
    except Exception as e:
        print(f"[Walfo Security Alert Error] Mismatch email error: {e}")


@api_view(['POST'])
@permission_classes([AllowAny])
def loginverifyOtp(request):
    response_details = {
        "status": False,
        "status_code": 400,
        "message": "Error happened while processing",
    }

    email = request.data.get('email')
    otp = request.data.get('otp')

    if not email or not otp:
        response_details['message'] = 'Email and OTP are required'
        return Response(response_details)

    try:
        otp_entry = CurrentWork.objects.filter(email=email).order_by('-created_at').first()

        if not otp_entry:
            response_details['message'] = 'OTP not found for this email'
            return Response(response_details)

        # ── Expiry check ────────────────────────────────────────────────────
        if _is_otp_expired(otp_entry):
            otp_entry.delete()
            response_details['message'] = f'OTP has expired. Please log in again to get a new one.'
            return Response(response_details)

        if str(otp_entry.otp) == str(otp):
            otp_entry.delete()
            user = User.objects.filter(email=email).first()
            if not user:
                response_details['message'] = 'User not found for this email'
                return Response(response_details)

            token, _ = Token.objects.get_or_create(user=user)
            response_details.update({
                "status": True,
                "status_code": 200,
                "message": "OTP verified",
                "token": token.key,
            })
        else:
            response_details['message'] = 'Invalid OTP'

    except Exception as e:
        response_details['message'] = f'An error occurred: {str(e)}'

    return Response(response_details)


@api_view(['POST'])
@permission_classes([AllowAny])
def forgot_password(request):
    """Step 1 – verify account exists, then send 4-digit OTP."""
    email = request.data.get('email')
    if not email:
        return Response({'status': False, 'status_code': 400, 'message': 'Email is required'})

    user = User.objects.filter(email=email).first()
    if not user:
        return Response({'status': False, 'status_code': 404, 'message': 'No account found with this email'})

    CurrentWork.objects.filter(email=email).delete()
    otp = ''.join(random.choices('0123456789', k=4))
    CurrentWork.objects.create(email=email, otp=otp)
    _send_email_async(
        'Walfo - Password Reset OTP',
        f'Hi {user.name},\n\n'
        f'Your OTP to reset your Walfo password is: {otp}\n\n'
        f'This OTP expires in {OTP_EXPIRY_MINUTES} minutes. '
        'If you did not request this, ignore this email.\n\n'
        'Best regards,\nThe Walfo Team',
        email
    )

    return Response({'status': True, 'status_code': 200, 'message': 'OTP sent to your email'})


@api_view(['POST'])
@permission_classes([AllowAny])
def reset_password(request):
    """Step 2 – verify OTP, set new hashed password, send confirmation email."""
    email = request.data.get('email')
    otp = request.data.get('otp')
    new_password = request.data.get('new_password')

    if not email or not otp or not new_password:
        return Response({'status': False, 'status_code': 400,
                         'message': 'Email, OTP and new password are required'})

    otp_entry = CurrentWork.objects.filter(email=email).order_by('-created_at').first()
    if not otp_entry:
        return Response({'status': False, 'status_code': 400,
                         'message': 'OTP not found. Please request a new one.'})

    # ── Expiry check ────────────────────────────────────────────────────────
    if _is_otp_expired(otp_entry):
        otp_entry.delete()
        return Response({'status': False, 'status_code': 400,
                         'message': 'OTP has expired. Please request a new one.'})

    if str(otp_entry.otp) != str(otp):
        return Response({'status': False, 'status_code': 400, 'message': 'Invalid OTP'})

    user = User.objects.filter(email=email).first()
    if not user:
        return Response({'status': False, 'status_code': 404, 'message': 'User not found'})

    user.set_password(new_password)
    user.save()
    otp_entry.delete()

    try:
        send_mail(
            'Your Walfo Password Has Been Changed',
            f'Hi {user.name},\n\n'
            'Your Walfo account password has been successfully changed.\n\n'
            f'If you did not make this change, please contact us immediately at '
            f'{settings.DEFAULT_FROM_EMAIL}.\n\n'
            'Best regards,\nThe Walfo Team',
            settings.DEFAULT_FROM_EMAIL,
            [email],
            fail_silently=True,
        )
    except Exception:
        pass  # email failure must not block the password-reset success response

    return Response({'status': True, 'status_code': 200,
                     'message': 'Password reset successfully. You can now log in.'})


# ===========================================================================
# SECTION 2 – DOCUMENT VIEWS
# ===========================================================================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def saveDocument(request):
    response_details = {
        "status": False,
        "status_code": 400,
        "message": "An error occurred during processing",
        "data": [],
    }

    serializer = DocumentSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(user=request.user)
        response_details.update({
            'status': True,
            'status_code': 200,
            'message': 'Document uploaded successfully',
            'data': serializer.data,
        })
    else:
        response_details['message'] = serializer.errors

    return Response(response_details)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def getUserDocuments(request):
    """
    Returns a paginated list of the authenticated user's documents.
    Query params: ?page=1&page_size=20  (defaults: page=1, page_size=20, max page_size=100)
    Response includes: data, total, page, page_size
    """
    try:
        page = max(1, int(request.query_params.get('page', 1)))
        page_size = min(100, max(1, int(request.query_params.get('page_size', 20))))
    except (ValueError, TypeError):
        page, page_size = 1, 20

    qs = Students_documents.objects.filter(user=request.user).order_by('-uploaded_at')
    total = qs.count()
    start = (page - 1) * page_size
    documents = qs[start:start + page_size]

    serializer = DocumentSerializer(documents, many=True)
    return Response({
        'status': True,
        'status_code': 200,
        'message': 'Documents retrieved successfully',
        'data': serializer.data,
        'total': total,
        'page': page,
        'page_size': page_size,
    })


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def deleteDocument(request, d_id):
    try:
        doc = Students_documents.objects.get(pk=d_id, user=request.user)
        public_id = doc.document.public_id
        destroy(public_id)
        doc.delete()
        return Response({
            "status": True,
            "status_code": 200,
            "message": "Document deleted successfully",
        })
    except Students_documents.DoesNotExist:
        return Response({
            "status": False,
            "status_code": 404,
            "message": "Document not found or you do not have permission to delete it",
        })
    except Exception as e:
        return Response({"status": False, "status_code": 500, "message": str(e)})


# ===========================================================================
# SECTION 3 – SECURITY & PROFILE VIEWS
# ===========================================================================

@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def validate_token(request):
    return Response({
        'status': True,
        'message': 'Token valid',
        'user': request.user.email,
        'name': request.user.name,
        'user_id': request.user.user_id,
        'face_image': request.user.face_image,
    }, status=200)


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def search_user_by_id(request):
    user_id = request.data.get('user_id')
    if not user_id:
        return Response({'message': 'User ID is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.get(user_id=user_id)
        serializer = UserSerializer(user)
        return Response({'message': 'User found', 'data': serializer.data}, status=status.HTTP_200_OK)
    except User.DoesNotExist:
        return Response({'message': 'User ID not found'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_face(request):
    """Save or update the authenticated user's face descriptor and face image."""
    face_descriptor = request.data.get('face_descriptor')
    face_image = request.data.get('face_image')

    if not face_descriptor or not face_image:
        return Response({
            'status': False,
            'status_code': 400,
            'message': 'face_descriptor and face_image are required',
        })

    descriptor_list = face_descriptor if isinstance(face_descriptor, list) else []
    if not _validate_descriptor(descriptor_list):
        return Response({
            'status': False,
            'status_code': 400,
            'message': 'Invalid face descriptor. Must be a 128-element numeric array.',
        })

    user = request.user
    user.face_descriptor = json.dumps(descriptor_list)
    user.face_image = face_image
    user.save(update_fields=['face_descriptor', 'face_image'])

    return Response({
        'status': True,
        'status_code': 200,
        'message': 'Face updated successfully',
        'face_image': face_image,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def report_spoof(request):
    """
    Called by the frontend when liveness or face-mismatch detection fails.
    Sends an alert email with the intruder's captured photo to the account owner.
    """
    email = request.data.get('email', '').strip()
    captured_image = request.data.get('captured_image', '')
    attempt_type = request.data.get('attempt_type', 'photo/video spoof')

    if not email:
        return Response({'status': False, 'status_code': 400, 'message': 'Email is required'})

    user = User.objects.filter(email__iexact=email).first()
    if not user:
        print(f"[Walfo Security Alert] No registered user found for email: {email}")
        return Response({'status': True, 'status_code': 200, 'message': 'Alert recorded'})

    attempt_time = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')

    spoof_img_bytes = None
    if captured_image and captured_image.startswith('data:'):
        try:
            _, b64data = captured_image.split(',', 1)
            spoof_img_bytes = base64.b64decode(b64data)
        except Exception as img_err:
            print(f"[Walfo Security Alert] Image decode error: {img_err}")

    intruder_img_html = (
        '<p><strong>&#128247; Captured face of the person who attempted access:</strong></p>'
        '<img src="cid:spoof_face_capture" '
        'style="width:240px;border-radius:10px;border:4px solid #c53030;margin-top:8px;" />'
    ) if spoof_img_bytes else '<p><em>No image was captured during this attempt.</em></p>'

    html_message = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 24px;">
      <div style="max-width:580px;margin:auto;background:#fff;border-radius:14px;
                  border:1px solid #e2e8f0;padding:36px;box-shadow:0 6px 20px rgba(0,0,0,0.10);">
        <h2 style="color:#c53030;margin-top:0;font-size:22px;">
          &#128680; Alert: Someone is Attempting to Misuse Your Account!
        </h2>
        <p style="color:#2d3748;">Hi <strong>{user.name}</strong>,</p>
        <p style="color:#4a5568;line-height:1.7;">
          We detected an <strong>unauthorized login attempt</strong> on your
          <strong>Walfo</strong> account. Someone entered your email address, but their face
          <strong>did NOT match your registered face</strong>.
          Access was <strong>blocked immediately</strong>.
        </p>
        <table style="width:100%;background:#fff5f5;border-radius:10px;
                      padding:16px;border:1px solid #feb2b2;margin:20px 0;border-collapse:collapse;">
          <tr>
            <td style="color:#742a2a;font-weight:bold;padding:6px 10px;">&#128337; Time:</td>
            <td style="color:#742a2a;padding:6px 10px;">{attempt_time}</td>
          </tr>
          <tr>
            <td style="color:#742a2a;font-weight:bold;padding:6px 10px;">&#128231; Account Email:</td>
            <td style="color:#742a2a;padding:6px 10px;">{email}</td>
          </tr>
          <tr>
            <td style="color:#742a2a;font-weight:bold;padding:6px 10px;">&#128273; Reason:</td>
            <td style="color:#742a2a;padding:6px 10px;">{attempt_type}</td>
          </tr>
        </table>
        {intruder_img_html}
        <p style="color:#4a5568;margin-top:24px;line-height:1.7;">
          <strong>No access was granted.</strong> No OTP was generated or sent to the attacker.
        </p>
        <p style="color:#4a5568;line-height:1.7;">
          <strong>If this was NOT you</strong>, we strongly recommend changing your password immediately.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0;" />
        <p style="color:#718096;font-size:12px;">
          This is an automated security notification from the Walfo Security System.
        </p>
      </div>
    </body>
    </html>
    """

    plain_message = (
        f'Hi {user.name},\n\n'
        'SECURITY ALERT: Someone is attempting to misuse your Walfo account!\n'
        'An unauthorized login attempt occurred, but the face did NOT match your registered face.\n\n'
        f'Reason: {attempt_type}\n'
        f'Time: {attempt_time}\n'
        f'Account Email: {email}\n\n'
        'No access was granted. Verification was blocked.\n\n'
        '\u2014 The Walfo Security Team'
    )

    try:
        msg = EmailMultiAlternatives(
            subject='\U0001f6a8 Walfo Security Alert \u2013 Someone is Attempting to Misuse Your Account!',
            body=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[email],
        )
        msg.attach_alternative(html_message, 'text/html')
        if spoof_img_bytes:
            mime_img = MIMEImage(spoof_img_bytes, 'jpeg')
            mime_img.add_header('Content-ID', '<spoof_face_capture>')
            mime_img.add_header('Content-Disposition', 'inline', filename='spoof_capture.jpg')
            msg.attach(mime_img)
        msg.send(fail_silently=False)
        print(f"[Walfo Security Alert SUCCESS] Alert email sent to: {email}")
        return Response({'status': True, 'status_code': 200,
                         'message': 'Security alert sent to account owner'})
    except Exception as e:
        print(f"[Walfo Security Alert ERROR] Failed to send email to {email}: {str(e)}")
        return Response({'status': False, 'status_code': 500,
                         'message': f'Email send error: {str(e)}'})
