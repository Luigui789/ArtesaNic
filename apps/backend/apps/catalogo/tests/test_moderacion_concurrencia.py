"""Carreras reales de AUD-14 en PostgreSQL: dos hilos, dos conexiones (D-AUD14-07).

La primera transacción se detiene con el ``Producto`` ya bloqueado; la prueba espera a ver
en ``pg_stat_activity`` que la segunda espera ese ``FOR UPDATE`` y solo entonces deja
continuar a la primera. Moderar, publicar y crear una solicitud se serializan sobre el
mismo lock: nunca queda un producto moderado visible ni una solicitud a medias.
"""

from django.contrib.auth.models import Permission

from apps.accounts.models import Usuario
from apps.catalogo import services
from apps.catalogo.models import ModeracionProducto, Producto
from apps.propuestas.tests.test_concurrencia import CarreraTestCase, _Hilo
from apps.solicitudes import services as solicitudes
from apps.solicitudes.models import RenglonSolicitud, Solicitud
from apps.talleres.tests.base import crear_administrador

from .base import imagen_prueba


def moderador(telefono):
    admin = crear_administrador(telefono)
    admin.user_permissions.add(Permission.objects.get(codename="moderar_producto"))
    return Usuario.objects.get(pk=admin.pk)


class CarrerasDeModeracionTests(CarreraTestCase):
    def setUp(self):
        super().setUp()
        self.primer_moderador = moderador("88881111")
        self.segundo_moderador = moderador("88882222")

    def moderar(self, actor, motivo):
        return _Hilo(services.moderar_producto, producto=self.producto, actor=actor, motivo=motivo)

    def solicitar(self):
        return _Hilo(
            solicitudes.crear_solicitud,
            comprador=self.comprador,
            renglones=[{"producto": self.producto.pk, "modalidad": "stock", "cantidad": 1}],
        )

    def test_dos_moderaciones_una_sola_fila(self):
        self.pausar_en(services, "_bloquear_producto")
        primera, segunda = self.carrera(
            self.moderar(self.primer_moderador, "Primer motivo"),
            self.moderar(self.segundo_moderador, "Segundo motivo"),
        )
        self.assertIsNone(primera.error)
        self.assertIsNone(segunda.error)
        self.assertTrue(primera.resultado)
        self.assertFalse(segunda.resultado)
        moderacion = ModeracionProducto.objects.get()
        self.assertEqual(
            (moderacion.moderado_por, moderacion.motivo), (self.primer_moderador, "Primer motivo")
        )

    def test_moderacion_gana_a_publicar(self):
        services.actualizar_producto(self.producto, fotografia_principal=imagen_prueba())
        services.despublicar_producto(self.producto)
        self.pausar_en(services, "_bloquear_producto")
        primera, segunda = self.carrera(
            self.moderar(self.primer_moderador, "Motivo"),
            _Hilo(services.publicar_producto, producto=self.producto),
        )
        self.assertIsNone(primera.error)
        self.assertIsInstance(segunda.error, services.ProductoModerado)
        self.producto.refresh_from_db()
        self.assertFalse(self.producto.publicado)
        self.assertFalse(Producto.objects.catalogo().filter(pk=self.producto.pk).exists())

    def test_publicar_gana_y_la_moderacion_lo_oculta(self):
        services.actualizar_producto(self.producto, fotografia_principal=imagen_prueba())
        services.despublicar_producto(self.producto)
        self.pausar_en(services, "_bloquear_producto")
        primera, segunda = self.carrera(
            _Hilo(services.publicar_producto, producto=self.producto),
            self.moderar(self.primer_moderador, "Motivo"),
        )
        self.assertIsNone(primera.error)
        self.assertIsNone(segunda.error)
        self.producto.refresh_from_db()
        self.assertTrue(self.producto.publicado)
        self.assertTrue(ModeracionProducto.objects.filter(producto=self.producto).exists())
        self.assertFalse(Producto.objects.catalogo().filter(pk=self.producto.pk).exists())

    def test_moderacion_gana_a_la_nueva_solicitud(self):
        self.pausar_en(services, "_bloquear_producto")
        primera, segunda = self.carrera(
            self.moderar(self.primer_moderador, "Motivo"), self.solicitar()
        )
        self.assertIsNone(primera.error)
        self.assertIsInstance(segunda.error, solicitudes.SolicitudInvalida)
        self.assertIn(solicitudes.MENSAJE_PRODUCTO, str(segunda.error.errores))
        self.assertFalse(Solicitud.objects.exists())
        self.assertFalse(RenglonSolicitud.objects.exists())

    def test_solicitud_gana_y_se_conserva(self):
        self.pausar_en(solicitudes, "_bloquear_productos")
        primera, segunda = self.carrera(
            self.solicitar(), self.moderar(self.primer_moderador, "Motivo")
        )
        self.assertIsNone(primera.error)
        self.assertIsNone(segunda.error)
        solicitud = Solicitud.objects.get()
        self.assertEqual(solicitud.renglones.get().producto, self.producto)
        self.assertTrue(ModeracionProducto.objects.filter(producto=self.producto).exists())
