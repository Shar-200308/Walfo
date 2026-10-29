from django.urls import path

from users.views import createUser, verifyOtp, requestOtpWithPassword, loginverifyOtp, saveDocument, \
   validate_token, getUserDocuments, deleteDocument, verify_credentials, verify_face_and_send_otp, \
   search_user_by_id, forgot_password, reset_password, update_face, report_spoof

urlpatterns = [
   path('create', createUser),
   path('verify-otp',verifyOtp),
   path('login',requestOtpWithPassword),
   path('login-verify',loginverifyOtp),
   path('verify-credentials', verify_credentials),
   path('verify-face-otp', verify_face_and_send_otp),
   path('upload-document', saveDocument),
   path('get-documents', getUserDocuments),
   path('validate-token',validate_token),
   path('delete-document/<str:d_id>', deleteDocument),
   path('search-user', search_user_by_id),
   path('forgot-password', forgot_password),
   path('reset-password', reset_password),
   path('update-face', update_face),
   path('report-spoof', report_spoof),
]

