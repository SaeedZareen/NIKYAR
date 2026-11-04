from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("audit", views.AuditViewSet, basename="audit")
urlpatterns = router.urls
