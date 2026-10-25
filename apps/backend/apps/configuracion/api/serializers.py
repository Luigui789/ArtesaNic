from rest_framework import serializers

from ..models import DECIMALES_TASA, DIGITOS_TASA


class ConfiguracionPublicaSerializer(serializers.Serializer):
    """Configuración pública. Sin tasa configurada, ambos campos son null (D-AUD14-06)."""

    tasa_cambio = serializers.DecimalField(
        max_digits=DIGITOS_TASA,
        decimal_places=DECIMALES_TASA,
        allow_null=True,
        read_only=True,
        help_text="Córdobas por un dólar, como texto decimal con cuatro decimales; null si "
        "la administración no la ha configurado. Solo informativa: los importes "
        "contractuales están en córdobas.",
    )
    actualizada_en = serializers.DateTimeField(
        allow_null=True,
        read_only=True,
        help_text="Fecha de la última actualización de la tasa; null sin tasa.",
    )
