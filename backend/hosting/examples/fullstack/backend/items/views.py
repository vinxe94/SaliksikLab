import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from .models import Item


@require_http_methods(['GET'])
def health(request):
    # Read the migrated table so readiness verifies the database too.
    return JsonResponse({'healthy': True, 'items': Item.objects.count()})


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def items(request):
    # This unauthenticated demo API must not be used with private data.
    if request.method == 'POST':
        try:
            body = json.loads(request.body)
            name = body.get('name') if isinstance(body, dict) else None
        except (ValueError, UnicodeDecodeError):
            name = None
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
            return JsonResponse({'error': 'Provide a name with 1 to 120 characters.'}, status=400)
        item = Item.objects.create(name=name.strip())
        return JsonResponse({'id': item.pk, 'name': item.name}, status=201)
    return JsonResponse({'items': list(Item.objects.order_by('id').values('id', 'name'))})
