from django.db import models
import os
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from cloudinary.models import CloudinaryField

# Create your models here.



class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('The Email must be set')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save()
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_staff', True)
        return self.create_user(email, password, **extra_fields)

class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=100, blank=True, null=True)
    password = models.CharField(max_length=128)
    user_id = models.CharField(max_length=10, blank=True, null=True)
    created_date = models.DateField(auto_now_add=True)
    created_time = models.TimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    face_descriptor = models.TextField(blank=True, null=True)
    face_image = models.TextField(blank=True, null=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    class Meta:
        db_table = 'users'

    def __str__(self):
        return self.name or self.email


class CurrentWork(models.Model):
     email = models.EmailField()
     otp = models.CharField(max_length=4)
     created_at = models.DateTimeField(auto_now=True)
     
     class Meta:
          db_table = 'current_work'
     
     def __str__(self):
          return self.email
     
     

def user_upload_path(instance, filename):
     ext = os.path.splitext(filename)[1].lower()
     if ext in ['.jpg', '.jpeg', '.png']:
          return f'portal_images/{filename}'
     elif ext == '.pdf':
          return f'portal_documents/{filename}'
     else:
          return f'portal_others/{filename}'


class Students_documents(models.Model):
     user = models.ForeignKey(User, on_delete=models.CASCADE)
     title = models.CharField(max_length=100)
     document = CloudinaryField('document', resource_type='raw')
     uploaded_at = models.DateTimeField(auto_now=True)
     
     class Meta:
          db_table = 'student_documents'
          
     def __str__(self):
          return self.title
     