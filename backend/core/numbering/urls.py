from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("sequences", views.SequenceViewSet, basename="number-sequence")
urlpatterns = router.urls
