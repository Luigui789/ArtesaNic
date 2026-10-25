"""Categorías y productos del catálogo (RF-001, RF-003, RF-017, RF-019; RN-003, RN-004).

El producto pertenece al taller, no a la cuenta del artesano. Sus modalidades son
capacidades declarativas que pueden combinarse: no registran existencias, que
pertenecen al inventario (RF-022), ni datos de un pedido, que pertenecen al futuro
dominio de pedidos. Ese dominio congelará nombre, precio y modalidad de cada renglón:
editar o despublicar un producto nunca modifica un pedido confirmado (RN-003).
"""

from decimal import Decimal

from django.core.validators import MinValueValidator, RegexValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.talleres.models import PATRON_NO_EN_BLANCO, EstadoTaller, Taller

from .imagenes import ruta_fotografia, validar_fotografia

# Código estable de la categoría en la API: minúsculas, dígitos y guiones bajos.
PATRON_CODIGO_CATEGORIA = r"\A[a-z0-9]+(_[a-z0-9]+)*\Z"
validar_codigo_categoria = RegexValidator(
    PATRON_CODIGO_CATEGORIA,
    "Usa minúsculas, dígitos y guiones bajos, sin espacios (por ejemplo, cuero_y_calzado).",
)

PRECIO_MINIMO = Decimal("0.01")


class Categoria(models.Model):
    """Categoría del catálogo. La API la lee por código; el nombre es solo presentación."""

    codigo = models.CharField(
        "código",
        max_length=50,
        unique=True,
        validators=[validar_codigo_categoria],
        help_text="Identificador estable que usa la API. No se modifica una vez creado.",
    )
    nombre = models.CharField("nombre", max_length=80, unique=True)

    class Meta:
        verbose_name = "categoría"
        verbose_name_plural = "categorías"
        ordering = ["nombre"]
        constraints = [
            models.CheckConstraint(
                condition=Q(codigo__regex=PATRON_CODIGO_CATEGORIA)
                & Q(nombre__regex=PATRON_NO_EN_BLANCO),
                name="categoria_datos_validos",
                violation_error_message="El código o el nombre de la categoría no son válidos.",
            ),
        ]

    def __str__(self):
        return self.nombre


class Modalidad(models.TextChoices):
    """Modalidades de venta que un producto puede admitir, solas o combinadas (RN-004)."""

    STOCK = "stock", "Venta desde stock"
    PRODUCCION = "produccion", "Producción por cantidad"
    PERSONALIZACION = "personalizacion", "Personalización"


# Cada modalidad se guarda en su propio campo booleano: así pueden combinarse y
# PostgreSQL comprueba que al menos una esté activa.
CAMPO_DE_MODALIDAD = {
    Modalidad.STOCK: "permite_stock",
    Modalidad.PRODUCCION: "permite_produccion",
    Modalidad.PERSONALIZACION: "permite_personalizacion",
}

# Datos del producto que escribe el artesano. Taller, publicación y fechas los fija
# el servidor.
CAMPOS_EDITABLES = (
    "nombre",
    "descripcion",
    "precio",
    "categoria",
    *CAMPO_DE_MODALIDAD.values(),
    "fotografia_principal",
)


class ProductoQuerySet(models.QuerySet):
    def catalogo(self):
        """Productos visibles en el catálogo público (RF-003, RN-003).

        Publicados y de un taller aprobado. Un producto marcado como publicado de un
        taller pendiente o rechazado no aparece.
        """
        return self.filter(publicado=True, taller__estado=EstadoTaller.APROBADO)

    def del_taller(self, taller: Taller):
        return self.filter(taller=taller)


class Producto(models.Model):
    taller = models.ForeignKey(
        Taller,
        on_delete=models.PROTECT,
        related_name="productos",
        verbose_name="taller",
        help_text="Taller dueño del producto. Lo fija el servidor a partir de la sesión.",
    )
    categoria = models.ForeignKey(
        Categoria,
        on_delete=models.PROTECT,
        related_name="productos",
        verbose_name="categoría",
    )
    fotografia_principal = models.ImageField(
        upload_to=ruta_fotografia,
        null=True,
        blank=True,
        max_length=200,
        validators=[validar_fotografia],
    )
    nombre = models.CharField("nombre", max_length=120)
    descripcion = models.TextField("descripción", max_length=2000)
    precio = models.DecimalField(
        "precio (C$)",
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(PRECIO_MINIMO)],
        help_text="Precio vigente en córdobas. Los pedidos futuros congelarán su propio importe.",
    )
    permite_stock = models.BooleanField("admite venta desde stock", default=False)
    permite_produccion = models.BooleanField("admite producción por cantidad", default=False)
    permite_personalizacion = models.BooleanField("admite personalización", default=False)
    # Despublicar no borra: el producto sigue existiendo para las referencias históricas.
    publicado = models.BooleanField("publicado", default=False)
    creado_en = models.DateTimeField("creado en", default=timezone.now, editable=False)
    actualizado_en = models.DateTimeField("actualizado en", auto_now=True)

    objects = ProductoQuerySet.as_manager()

    class Meta:
        verbose_name = "producto"
        verbose_name_plural = "productos"
        constraints = [
            models.CheckConstraint(
                condition=Q(permite_stock=True)
                | Q(permite_produccion=True)
                | Q(permite_personalizacion=True),
                name="producto_al_menos_una_modalidad",
                violation_error_message="El producto debe admitir al menos una modalidad de venta.",
            ),
            models.CheckConstraint(
                condition=Q(precio__gte=PRECIO_MINIMO),
                name="producto_precio_positivo",
                violation_error_message="El precio debe ser mayor que cero.",
            ),
            models.CheckConstraint(
                condition=Q(nombre__regex=PATRON_NO_EN_BLANCO)
                & Q(descripcion__regex=PATRON_NO_EN_BLANCO),
                name="producto_datos_minimos",
                violation_error_message="El nombre y la descripción son obligatorios.",
            ),
        ]
        indexes = [
            # Consulta por defecto del catálogo público: publicados, del más reciente al
            # más antiguo. Taller y categoría ya tienen el índice de su clave foránea.
            models.Index(fields=["publicado", "-creado_en"], name="producto_catalogo_idx"),
        ]

    def __str__(self):
        return self.nombre

    @property
    def modalidades(self) -> list[str]:
        """Códigos de las modalidades activas, en el orden canónico de ``Modalidad``."""
        return [m.value for m, campo in CAMPO_DE_MODALIDAD.items() if getattr(self, campo)]

    def pertenece_a(self, usuario) -> bool:
        """Contrato de ``EsPropietario``: solo el artesano dueño del taller lo gestiona."""
        return usuario.is_authenticated and self.taller.propietario_id == usuario.pk
