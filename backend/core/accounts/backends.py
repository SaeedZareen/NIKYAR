from django.contrib.auth.backends import ModelBackend

from . import directory


class DirectoryBackend(ModelBackend):
    """
    پس از ModelBackend: ورود با Active Directory (core.accounts.directory). خطای اتصال یا گروه با پیام فارسی در
    request.directory_error می‌ماند تا صفحه‌ی ورود به‌جای «گذرواژه درست نیست» آن را نشان دهد.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        try:
            user = directory.authenticate(username or "", password or "")
        except directory.DirectoryError as e:
            if request is not None:
                request.directory_error = str(e)
            return None
        return user if user is not None and self.user_can_authenticate(user) else None
