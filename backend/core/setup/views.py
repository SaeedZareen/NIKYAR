from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import parsers, permissions
from rest_framework.authentication import SessionAuthentication
from rest_framework.response import Response
from rest_framework.views import APIView

from core.accounts.serializers import MeSerializer
from core.accounts.views import LoginThrottle
from core.kernel.api import BusinessError
from core.licensing import service as licensing

from . import service
from .serializers import SetupRequestSerializer, SetupStatusSerializer


@method_decorator(ensure_csrf_cookie, name="get")
class SetupView(APIView):
    """
    راه‌اندازی نخستین، بی ورود: GET وضعیت (آیا هنوز کاربری نیست) و شناسه‌ی نصب؛ POST پایان راه‌اندازی با کد
    راه‌اندازی (پنجره‌ی سرور). پس از ساخت نخستین کاربر برای همیشه بسته است.
    """

    permission_classes = [permissions.AllowAny]
    license_exempt = True
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]

    def get_throttles(self):
        # کد راه‌اندازی با همان سقف تلاش ورود در برابر حدس زدن محافظت می‌شود
        return [LoginThrottle()] if self.request.method == "POST" else []

    @extend_schema(responses=SetupStatusSerializer)
    def get(self, request):
        needed = service.needed()
        if needed:
            service.code()  # کد پیش از نخستین نمایش جادوگر ساخته و در پنجره‌ی سرور هم چاپ شده است
        return Response({"needed": needed, "install_id": licensing.install_id()})

    @extend_schema(request={"multipart/form-data": SetupRequestSerializer}, responses={200: MeSerializer, 204: None})
    def post(self, request):
        # نشست‌ساز است و کاربر هنوز وارد نشده؛ مثل ورود، CSRF دستی بررسی می‌شود
        SessionAuthentication().enforce_csrf(request)
        if not service.needed():
            raise BusinessError("راه‌اندازی نخستین پیش‌تر انجام شده است.")
        s = SetupRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        service.check_code(s.validated_data["code"])
        if s.validated_data["mode"] == "demo":
            service.finish_demo()
            return Response(status=204)
        admin = service.finish_org(request, s.validated_data)
        return Response(MeSerializer(admin).data)
