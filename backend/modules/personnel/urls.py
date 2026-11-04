from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("personnel/employees", views.EmployeeViewSet, basename="employee")
router.register("personnel/educations", views.EducationViewSet, basename="education")
router.register("personnel/work-history", views.WorkHistoryViewSet, basename="workhistory")
router.register("personnel/dependents", views.DependentViewSet, basename="dependent")
router.register("personnel/bank-accounts", views.BankAccountViewSet, basename="bankaccount")
router.register("personnel/documents", views.DocumentViewSet, basename="document")
urlpatterns = router.urls
