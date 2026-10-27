from rest_framework import serializers

from ..models import Notificacion


class NotificacionSerializer(serializers.ModelSerializer):
    titulo = serializers.SerializerMethodField()
    detalle = serializers.SerializerMethodField()
    leida = serializers.SerializerMethodField()

    class Meta:
        model = Notificacion
        fields = [
            "id",
            "tipo",
            "titulo",
            "detalle",
            "solicitud_id",
            "pedido_id",
            "creada_en",
            "leida",
            "leida_en",
        ]

    def get_titulo(self, obj) -> str:
        return obj.get_tipo_display()

    def get_detalle(self, obj) -> str:
        recurso = "solicitud" if obj.solicitud_id else "pedido"
        identificador = obj.solicitud_id or obj.pedido_id
        return f"{obj.get_tipo_display()} para {recurso} #{identificador}."

    def get_leida(self, obj) -> bool:
        return obj.leida_en is not None


class ResumenSerializer(serializers.Serializer):
    no_leidas = serializers.IntegerField()


class ResultadoMarcarTodasSerializer(serializers.Serializer):
    actualizadas = serializers.IntegerField()
    no_leidas = serializers.IntegerField()
