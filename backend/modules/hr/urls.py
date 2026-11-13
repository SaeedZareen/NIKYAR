from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("employees", views.EmployeeViewSet, basename="hr-employee")
router.register("educations", views.EducationViewSet, basename="hr-education")
router.register("work-history", views.WorkHistoryViewSet, basename="hr-work-history")
router.register("dependents", views.DependentViewSet, basename="hr-dependent")
router.register("bank-accounts", views.BankAccountViewSet, basename="hr-bank-account")
router.register("insurances", views.InsuranceViewSet, basename="hr-insurance")
router.register("documents", views.DocumentViewSet, basename="hr-document")
router.register("events", views.EventViewSet, basename="hr-event")

urlpatterns = router.urls
