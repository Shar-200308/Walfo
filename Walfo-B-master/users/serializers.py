from rest_framework import serializers

from users.models import User, Students_documents


class DocumentSerializer(serializers.ModelSerializer):
    document_url = serializers.SerializerMethodField()

    class Meta:
        model = Students_documents
        fields = ['id', 'user', 'title', 'document', 'uploaded_at', 'document_url']
        read_only_fields = ['user']

    def get_document_url(self, obj):
        if obj.document:
            url = obj.document.url
            # Ensure HTTPS
            if url.startswith('http://'):
                url = url.replace('http://', 'https://', 1)
            return url
        return None


class UserSerializer(serializers.ModelSerializer):
    """Safe serializer — exposes only non-sensitive public fields.
    Intentionally excludes: password, face_descriptor, face_image,
    is_staff, is_superuser, groups, user_permissions.
    """
    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'user_id', 'created_date']