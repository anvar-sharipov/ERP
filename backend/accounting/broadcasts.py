# backend/accounting/broadcasts.py
"""
Рассылка WS-событий дашборду (см. utils/ws/dashboard_consumer.py) — по тому же
принципу, что и _broadcast_closed_period в transaction_views.py: клиент,
получив событие, сам переспрашивает актуальные данные (invalidateQueries),
здесь никакие данные не пересылаются, только сигнал "что-то изменилось".
"""


def broadcast_dashboard_update():
    from django.db import connection
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync

    channel_layer = get_channel_layer()
    schema_name = connection.schema_name
    async_to_sync(channel_layer.group_send)(
        f"dashboard_{schema_name}",
        {"type": "dashboard_changed"},
    )
