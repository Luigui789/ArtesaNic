from rest_framework import serializers

from ..models import EstadoOperacion, OperacionIdempotente, TipoOperacion
from ..services import CODIGO_CLAVE_REUTILIZADA

CODIGOS_CONFLICTO = [(CODIGO_CLAVE_REUTILIZADA, "Clave reutilizada con otra petición")]
# Las operaciones en curso o revertidas nunca son visibles fuera de su transacción.
ESTADOS_VISIBLES = [(EstadoOperacion.COMPLETADA.value, EstadoOperacion.COMPLETADA.label)]


class ConflictoIdempotenciaSerializer(serializers.Serializer):
    detail = serializers.CharField()
    codigo = serializers.ChoiceField(choices=CODIGOS_CONFLICTO)


class RecursoOperacionSerializer(serializers.Serializer):
    tipo = serializers.CharField(read_only=True, help_text="Modelo resultante, p. ej. «solicitud».")
    id = serializers.IntegerField(read_only=True)


class OperacionIdempotenteSerializer(serializers.ModelSerializer):
    """Resultado propio. Nunca expone la huella, la petición original ni el actor."""

    tipo = serializers.ChoiceField(choices=TipoOperacion.choices, read_only=True)
    estado = serializers.ChoiceField(choices=ESTADOS_VISIBLES, read_only=True)
    recurso = serializers.SerializerMethodField()
    codigo_http = serializers.IntegerField(
        read_only=True,
        help_text="Código de la respuesta original; una repetición devuelve el mismo.",
    )
    completado_en = serializers.DateTimeField(read_only=True)

    class Meta:
        model = OperacionIdempotente
        fields = ["tipo", "estado", "recurso", "codigo_http", "creado_en", "completado_en"]
        read_only_fields = fields

    def get_recurso(self, obj) -> RecursoOperacionSerializer:
        return {"tipo": obj.recurso_tipo.rpartition(".")[2], "id": obj.recurso_id}
