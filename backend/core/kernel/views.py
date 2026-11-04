from rest_framework.decorators import api_view
from rest_framework.response import Response

from .license import license_expired, load_license, module_status
from .registry import all_actions, all_entities, all_modules


@api_view(["GET"])
def system_info(request):
    lic = load_license()
    return Response({
        "customer": lic.get("customer"),
        "expires": lic.get("expires"),
        "expired": license_expired(lic),
        "max_users": lic.get("max_users"),
        "modules": module_status(),
    })


@api_view(["GET"])
def catalog(request):
    """کاتالوگ آنچه ماژول‌ها به سامانه اضافه کرده‌اند (برای فرایندساز و فرم‌ساز)."""
    return Response({
        "permissions": [{"module": m.code, "module_title": m.title, "code": c, "title": t}
                        for m in all_modules() for c, t in m.permissions],
        "actions": [{"code": a.code, "title": a.title, "description": a.description,
                     "inputs": [{"key": k, "title": t} for k, t in a.inputs],
                     "outputs": [{"key": k, "title": t} for k, t in a.outputs]}
                    for a in all_actions().values()],
        "entities": [{"code": e.code, "title": e.title} for e in all_entities().values()],
    })
