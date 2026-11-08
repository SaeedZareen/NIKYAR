from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter(trailing_slash=True)
router.register("versions", views.FormVersionViewSet, basename="form-version")
router.register("submissions", views.FormSubmissionViewSet, basename="form-submission")
# فرم‌ها در ریشه‌ی /api/forms/ (شناسه‌ی عددی، تا با versions و submissions تداخل نکند)
router.register("", views.FormViewSet, basename="form")
urlpatterns = router.urls
