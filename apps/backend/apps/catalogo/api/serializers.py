from rest_framework import serializers

from apps.accounts.api.serializers import SinCamposDesconocidosMixin

from ..models import CAMPO_DE_MODALIDAD, PRECIO_MINIMO, Categoria, Modalidad, Producto

MENSAJE_SIN_MODALIDAD = "Selecciona al menos una modalidad de venta."
MENSAJE_MODALIDAD_REPETIDA = "Cada modalidad se indica una sola vez."


class CategoriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Categoria
        fields = ["id", "codigo", "nombre"]
        read_only_fields = fields


class TallerResumenSerializer(serializers.Serializer):
    """Referencia al perfil público del taller: ``GET /api/v1/talleres/{id}/``."""

    id = serializers.IntegerField(read_only=True)
    nombre = serializers.CharField(read_only=True)


class ModalidadesField(serializers.ListField):
    """Lista de códigos de modalidad: al menos uno y sin repetir (RN-004).

    Se recibe y se entrega como lista; el modelo la guarda en un booleano por modalidad.
    """

    child = serializers.ChoiceField(choices=Modalidad.choices)

    def __init__(self, **kwargs):
        kwargs.setdefault(
            "help_text",
            "Modalidades de venta que admite el producto, solas o combinadas: "
            "stock, produccion, personalizacion.",
        )
        kwargs["error_messages"] = {
            "empty": MENSAJE_SIN_MODALIDAD,
            "min_length": MENSAJE_SIN_MODALIDAD,
        } | kwargs.get("error_messages", {})
        super().__init__(allow_empty=False, min_length=1, **kwargs)

    def to_internal_value(self, data):
        valores = super().to_internal_value(data)
        if len(set(valores)) != len(valores):
            raise serializers.ValidationError(MENSAJE_MODALIDAD_REPETIDA)
        return valores


class ProductoEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    """Datos que escribe el artesano. Taller, publicación y fechas no son campos de entrada:
    enviarlos responde 400. La fotografía principal está pendiente de DR-01."""

    nombre = serializers.CharField(max_length=120)
    descripcion = serializers.CharField(max_length=2000)
    precio = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=PRECIO_MINIMO,
        help_text="Precio en córdobas, con hasta dos decimales. Mayor que cero.",
    )
    categoria = serializers.SlugRelatedField(
        slug_field="codigo",
        queryset=Categoria.objects.all(),
        help_text="Código de una categoría de GET /api/v1/categorias/.",
        error_messages={"does_not_exist": "La categoría indicada no existe."},
    )
    modalidades = ModalidadesField()

    def validated_data_del_modelo(self) -> dict:
        """Traduce la lista de modalidades a los campos booleanos del modelo.

        Al recibir ``modalidades`` se fijan los tres campos: las no enviadas quedan
        desactivadas. Sin ``modalidades`` (edición parcial), no se toca ninguno.
        """
        datos = dict(self.validated_data)
        modalidades = datos.pop("modalidades", None)
        if modalidades is not None:
            for modalidad, campo in CAMPO_DE_MODALIDAD.items():
                datos[campo] = modalidad.value in modalidades
        return datos


class _ProductoLecturaSerializer(serializers.ModelSerializer):
    categoria = CategoriaSerializer(read_only=True)
    modalidades = serializers.ListField(
        child=serializers.ChoiceField(choices=Modalidad.choices),
        read_only=True,
        help_text="Modalidades de venta que admite, en orden: stock, produccion, personalizacion.",
    )
    taller = TallerResumenSerializer(read_only=True)


class ProductoPublicoSerializer(_ProductoLecturaSerializer):
    """Producto del catálogo público. Solo productos publicados de talleres aprobados."""

    class Meta:
        model = Producto
        fields = [
            "id",
            "nombre",
            "descripcion",
            "precio",
            "categoria",
            "modalidades",
            "taller",
            "creado_en",
        ]
        read_only_fields = fields


class ProductoPropioSerializer(_ProductoLecturaSerializer):
    """Producto del taller propio: añade su estado de publicación y última edición."""

    class Meta:
        model = Producto
        fields = [
            "id",
            "nombre",
            "descripcion",
            "precio",
            "categoria",
            "modalidades",
            "taller",
            "publicado",
            "creado_en",
            "actualizado_en",
        ]
        read_only_fields = fields


class FiltrosCatalogoSerializer(serializers.Serializer):
    """Parámetros de consulta del catálogo público (RF-003)."""

    ORDENES = {
        "recientes": ("-creado_en", "-id"),
        "precio_asc": ("precio", "id"),
        "precio_desc": ("-precio", "-id"),
        "nombre": ("nombre", "id"),
    }

    q = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=120,
        help_text="Búsqueda por nombre (contiene, sin mayúsculas).",
    )
    categoria = serializers.CharField(
        required=False, allow_blank=True, max_length=50, help_text="Código de categoría."
    )
    precio_min = serializers.DecimalField(
        required=False, max_digits=10, decimal_places=2, min_value=0, help_text="Precio mínimo."
    )
    precio_max = serializers.DecimalField(
        required=False, max_digits=10, decimal_places=2, min_value=0, help_text="Precio máximo."
    )
    taller = serializers.IntegerField(
        required=False, min_value=1, help_text="Identificador del taller."
    )
    orden = serializers.ChoiceField(
        choices=list(ORDENES),
        default="recientes",
        help_text="recientes (por defecto), precio_asc, precio_desc o nombre.",
    )

    def validate(self, attrs):
        minimo, maximo = attrs.get("precio_min"), attrs.get("precio_max")
        if minimo is not None and maximo is not None and minimo > maximo:
            raise serializers.ValidationError(
                {"precio_max": ["Debe ser mayor o igual que el precio mínimo."]}
            )
        return attrs
