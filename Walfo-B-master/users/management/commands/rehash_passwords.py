"""
Management command: rehash_passwords

Detects users whose password is stored as plaintext (not a Django hash) and
re-hashes it using Django's PBKDF2 algorithm.

The correct way to detect a plaintext password is to use identify_hasher():
if it raises ValueError, the stored value is NOT a valid Django hash → it's plaintext.

Usage:
    python manage.py rehash_passwords
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.hashers import identify_hasher, make_password
from users.models import User


class Command(BaseCommand):
    help = 'Re-hash any existing plaintext passwords in the database.'

    def handle(self, *args, **options):
        users = User.objects.all()
        fixed = 0
        skipped = 0

        for user in users:
            raw_password = user.password

            if not raw_password:
                skipped += 1
                continue

            try:
                identify_hasher(raw_password)
                # No exception → already a valid Django hash → skip
                self.stdout.write(f'  — Already hashed: {user.email}')
                skipped += 1
            except ValueError:
                # ValueError → NOT a Django hash → plaintext → rehash it
                user.password = make_password(raw_password)
                user.save(update_fields=['password'])
                self.stdout.write(
                    self.style.SUCCESS(f'  [OK] Re-hashed password for: {user.email}')
                )
                fixed += 1

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f'Done. {fixed} password(s) re-hashed, {skipped} already hashed/skipped.'
        ))
