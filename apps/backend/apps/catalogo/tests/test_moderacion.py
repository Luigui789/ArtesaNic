"""Moderación administrativa de productos (RF-013.3, RF-019; RN-003; D-AUD14-01 a 04).

``Producto.publicado`` es la decisión del artesano; ``ModeracionProducto`` la del
administrador. Moderar retira del catálogo y de nuevas solicitudes sin tocar
``publicado`` ni los compromisos creados antes.
"""

from decimal import Decimal

from django.contrib.admin import helpers
from django.contrib.auth.models import Permission
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import Client

from apps.accounts.models import Rol, Usuario
from apps.accounts.tests.base import PASSWORD, crear_usuario
from apps.catalogo import services
from apps.catalogo.models import MAX_MOTIVO_MODERACION, ModeracionProducto, Producto
from apps.pagos.tests.base import confirmar_pedido
from apps.pedidos.models import LineaPedido, Pedido
from apps.propuestas import services as propuestas
from apps.solicitudes import services as solicitudes
from apps.solicitudes.models import EstadoSolicitud
from apps.solicitudes.tests.base import SolicitudesAPITestCase, datos_renglon
from apps.talleres.tests.base import crear_administrador

from .base import (
    URL_CATALOGO,
    url_despublicar,
    url_mi_producto,
    url_producto,
    url_publicar,
)

URL_ADMIN_PRODUCTOS = "/admin/catalogo/producto/"
MOTIVO = "La fotografía no corresponde al producto ofrecido."


def moderador(telefono="88880000", **extra):
    """Administrador de plataforma sin superusuario, con ver y moderar productos."""
    admin = crear_administrador(telefono, **extra)
    admin.user_permissions.add(
        *Permission.objects.filter(codename__in=["view_producto", "moderar_producto"])
    )
    return Usuario.objects.get(pk=admin.pk)


class ModeracionTestCase(SolicitudesAPITestCase):
    def setUp(self):
        super().setUp()
        self.moderador = moderador()

    def moderar(self, producto=None, motivo=MOTIVO, actor=None):
        return services.moderar_producto(
            producto or self.producto, actor=actor or self.moderador, motivo=motivo
        )

    def ids_catalogo(self):
        self.anonimo()
        return [p["id"] for p in self.client.get(URL_CATALOGO).json()["results"]]


class ServicioModeracionTests(ModeracionTestCase):
    def test_registra_actor_motivo_y_fecha_sin_cambiar_publicado(self):
        antes = Producto.objects.filter(pk=self.producto.pk).values().get()
        self.assertTrue(self.moderar(motivo=f"  {MOTIVO}  "))
        moderacion = ModeracionProducto.objects.get(producto=self.producto)
        self.assertEqual(moderacion.moderado_por, self.moderador)
        self.assertEqual(moderacion.motivo, MOTIVO)  # trim
        self.assertIsNotNone(moderacion.moderado_en)
        # Ningún dato del producto cambia: tampoco publicado ni actualizado_en.
        self.assertEqual(Producto.objects.filter(pk=self.producto.pk).values().get(), antes)
        self.assertTrue(antes["publicado"])

    def test_motivo_vacio_o_largo_rechazado(self):
        for motivo in ("", "   ", None, "x" * (MAX_MOTIVO_MODERACION + 1)):
            with self.subTest(motivo=motivo and motivo[:5]), self.assertRaises(ValidationError):
                self.moderar(motivo=motivo)
        self.assertTrue(self.moderar(motivo="x" * MAX_MOTIVO_MODERACION))

    def test_actores_no_validos(self):
        sin_permiso = crear_administrador("88881111")
        inactivo = moderador("88882222", is_active=False)
        artesano = self.artesano
        comprador = crear_usuario("86660000", rol=Rol.COMPRADOR)
        for actor in (sin_permiso, inactivo, artesano, comprador):
            with self.subTest(actor=actor.telefono), self.assertRaises(services.ModeradorNoValido):
                self.moderar(actor=actor)
        with self.assertRaises(services.ModeradorNoValido):
            services.moderar_producto(self.producto, actor=None, motivo=MOTIVO)
        self.assertFalse(ModeracionProducto.objects.exists())

    def test_repetida_no_duplica_ni_sobrescribe(self):
        self.moderar()
        otro = moderador("88883333")
        self.assertFalse(self.moderar(actor=otro, motivo="Otro motivo"))
        moderacion = ModeracionProducto.objects.get()
        self.assertEqual((moderacion.moderado_por, moderacion.motivo), (self.moderador, MOTIVO))

    def test_append_only_y_unica_en_bd(self):
        self.moderar()
        moderacion = ModeracionProducto.objects.get()
        moderacion.motivo = "Cambiado"
        with self.assertRaises(ValidationError):
            moderacion.save()
        with self.assertRaises(ValidationError):
            moderacion.delete()
        with self.assertRaises(IntegrityError), transaction.atomic():
            ModeracionProducto.objects.bulk_create(
                [
                    ModeracionProducto(
                        producto=self.producto, moderado_por=self.moderador, motivo="x"
                    )
                ]
            )
        self.assertEqual(ModeracionProducto.objects.get().motivo, MOTIVO)

    def test_motivo_en_blanco_imposible_en_bd(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            ModeracionProducto.objects.bulk_create(
                [
                    ModeracionProducto(
                        producto=self.producto, moderado_por=self.moderador, motivo=" "
                    )
                ]
            )

    def test_moderar_producto_despublicado_tambien_es_valido(self):
        services.despublicar_producto(self.producto)
        self.assertTrue(self.moderar())
        self.producto.refresh_from_db()
        self.assertFalse(self.producto.publicado)


class VisibilidadTests(ModeracionTestCase):
    def test_catalogo_excluye_lo_moderado(self):
        # Prueba mutante: falla si catalogo() deja de filtrar la moderación.
        self.assertIn(self.producto.pk, self.ids_catalogo())
        self.moderar()
        self.assertNotIn(self.producto.pk, self.ids_catalogo())
        self.assertIn(self.otro_producto.pk, self.ids_catalogo())
        self.assertFalse(Producto.objects.catalogo().filter(pk=self.producto.pk).exists())

    def test_detalle_publico_404(self):
        self.moderar()
        self.anonimo()
        self.assertEqual(self.client.get(url_producto(self.producto.pk)).status_code, 404)

    def test_filtros_del_catalogo_tampoco_lo_muestran(self):
        self.moderar()
        self.anonimo()
        for params in (
            {"taller": self.taller.pk},
            {"q": self.producto.nombre},
            {"categoria": self.categoria.codigo},
        ):
            ids = [p["id"] for p in self.client.get(URL_CATALOGO, params).json()["results"]]
            self.assertNotIn(self.producto.pk, ids, params)


class ArtesanoModeradoTests(ModeracionTestCase):
    def setUp(self):
        super().setUp()
        self.autenticar(self.artesano)

    def test_producto_propio_incluye_moderacion_sin_actor(self):
        datos = self.client.get(url_mi_producto(self.producto.pk)).json()
        self.assertIsNone(datos["moderacion"])
        self.moderar()
        datos = self.client.get(url_mi_producto(self.producto.pk)).json()
        self.assertEqual(set(datos["moderacion"]), {"motivo", "moderado_en"})
        self.assertEqual(datos["moderacion"]["motivo"], MOTIVO)
        self.assertTrue(datos["publicado"])
        self.assertNotIn(self.moderador.telefono, str(datos))
        listado = self.client.get("/api/v1/productos/mios/").json()["results"]
        moderado = next(p for p in listado if p["id"] == self.producto.pk)
        self.assertEqual(moderado["moderacion"]["motivo"], MOTIVO)

    def test_catalogo_publico_no_expone_moderacion(self):
        self.anonimo()
        datos = self.client.get(url_producto(self.otro_producto.pk)).json()
        self.assertNotIn("moderacion", datos)

    def test_publicar_moderado_409_sin_cambios(self):
        services.despublicar_producto(self.producto)
        self.moderar()
        respuesta = self.client.post(url_publicar(self.producto.pk))
        self.assertEqual(respuesta.status_code, 409)
        self.assertEqual(respuesta.json()["codigo"], "producto_moderado")
        self.producto.refresh_from_db()
        self.assertFalse(self.producto.publicado)
        # También si ya figura como publicado: no hay atajo idempotente.
        otro = self.otro_producto
        self.moderar(otro)
        self.assertEqual(self.client.post(url_publicar(otro.pk)).status_code, 409)

    def test_despublicar_moderado_permitido_y_conserva_moderacion(self):
        self.moderar()
        respuesta = self.client.post(url_despublicar(self.producto.pk))
        self.assertEqual(respuesta.status_code, 200)
        self.assertFalse(respuesta.json()["publicado"])
        self.assertEqual(respuesta.json()["moderacion"]["motivo"], MOTIVO)
        self.assertTrue(ModeracionProducto.objects.filter(producto=self.producto).exists())

    def test_editar_moderado_permitido_sin_volverlo_publico(self):
        self.moderar()
        respuesta = self.client.patch(
            url_mi_producto(self.producto.pk), {"precio": "999.00"}, format="json"
        )
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.json()["precio"], "999.00")
        self.assertIsNotNone(respuesta.json()["moderacion"])
        self.assertNotIn(self.producto.pk, self.ids_catalogo())

    def test_no_puede_enviar_moderacion_por_la_api(self):
        respuesta = self.client.patch(
            url_mi_producto(self.producto.pk), {"moderacion": None}, format="json"
        )
        self.assertEqual(respuesta.status_code, 400)


class SolicitudesYModeracionTests(ModeracionTestCase):
    def test_nueva_solicitud_rechaza_producto_moderado(self):
        self.moderar()
        respuesta = self.enviar(datos_renglon(self.producto))
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn(solicitudes.MENSAJE_PRODUCTO, str(respuesta.json()))
        self.assertFalse(
            solicitudes.Solicitud.objects.filter(renglones__producto=self.producto).exists()
        )

    def test_rechazo_atomico_con_varios_renglones(self):
        self.moderar()
        respuesta = self.enviar(datos_renglon(self.otro_producto), datos_renglon(self.producto))
        self.assertEqual(respuesta.status_code, 400)
        self.assertFalse(solicitudes.Solicitud.objects.exists())

    def test_solicitud_previa_continua_hasta_pedido(self):
        solicitud = self.crear(datos_renglon(self.producto, cantidad=2))
        self.moderar()
        renglon = solicitud.renglones.get()
        solicitudes.resolver_renglon(
            artesano=self.artesano,
            solicitud_id=solicitud.pk,
            renglon_id=renglon.pk,
            resolucion="aceptado",
            motivo_rechazo="",
        )
        propuestas.finalizar_propuesta(
            artesano=self.artesano,
            solicitud_id=solicitud.pk,
            modalidad_entrega="retiro_taller",
            costo_entrega=Decimal("0"),
            lineas=[{"renglon": renglon.pk}],
        )
        propuestas.decidir_propuesta(
            comprador=self.comprador, solicitud_id=solicitud.pk, decision="aceptar"
        )
        pedido = Pedido.objects.get(solicitud=solicitud)
        self.assertEqual(pedido.lineas.get().producto, self.producto)
        solicitud.refresh_from_db()
        self.assertNotEqual(solicitud.estado, EstadoSolicitud.PENDIENTE_REVISION)

    def test_pedido_historico_intacto(self):
        pedido = confirmar_pedido(
            comprador=self.comprador, artesano=self.artesano, producto=self.producto
        )
        antes_pedido = Pedido.objects.filter(pk=pedido.pk).values().get()
        antes_lineas = list(LineaPedido.objects.filter(pedido=pedido).values())
        self.moderar()
        self.assertEqual(Pedido.objects.filter(pk=pedido.pk).values().get(), antes_pedido)
        self.assertEqual(list(LineaPedido.objects.filter(pedido=pedido).values()), antes_lineas)
        self.assertEqual(pedido.estado_operativo.estado, "confirmado")


class ProductoEnAdminTests(ModeracionTestCase):
    def setUp(self):
        super().setUp()
        # Django Admin usa el cliente de navegador (sesión), no APIClient.
        self.client = Client()
        self.client.force_login(self.moderador)

    def accion(self, *productos, **extra):
        return self.client.post(
            URL_ADMIN_PRODUCTOS,
            {
                "action": "moderar",
                helpers.ACTION_CHECKBOX_NAME: [p.pk for p in productos],
                **extra,
            },
        )

    def test_lista_filtros_y_detalle_de_solo_lectura(self):
        self.moderar(self.otro_producto)
        respuesta = self.client.get(URL_ADMIN_PRODUCTOS)
        self.assertEqual(respuesta.status_code, 200)
        self.assertContains(respuesta, self.producto.nombre)
        self.assertContains(respuesta, "Retirado por moderación")
        filtrados = self.client.get(URL_ADMIN_PRODUCTOS, {"moderado": "si"})
        self.assertEqual(
            [p.pk for p in filtrados.context["cl"].result_list], [self.otro_producto.pk]
        )
        for params in (
            {"moderado": "no"},
            {"publicado__exact": "1"},
            {"taller__estado": "aprobado"},
        ):
            self.assertEqual(self.client.get(URL_ADMIN_PRODUCTOS, params).status_code, 200)
        detalle = self.client.get(f"{URL_ADMIN_PRODUCTOS}{self.otro_producto.pk}/change/")
        self.assertEqual(detalle.status_code, 200)
        self.assertContains(detalle, MOTIVO)
        for campo in ("nombre", "precio", "publicado", "categoria", "taller"):
            self.assertIn(campo, detalle.context["adminform"].readonly_fields)

    def test_moderar_pide_motivo_y_usa_el_servicio(self):
        respuesta = self.accion(self.producto)
        self.assertEqual(respuesta.status_code, 200)
        self.assertTemplateUsed(respuesta, "admin/catalogo/producto/moderar.html")
        self.assertFalse(ModeracionProducto.objects.exists())

        respuesta = self.accion(self.producto, confirmar="1", motivo="   ")
        self.assertEqual(respuesta.status_code, 200)  # motivo obligatorio
        self.assertFalse(ModeracionProducto.objects.exists())

        respuesta = self.accion(self.producto, confirmar="1", motivo=MOTIVO)
        self.assertEqual(respuesta.status_code, 302)
        moderacion = ModeracionProducto.objects.get()
        self.assertEqual((moderacion.moderado_por, moderacion.motivo), (self.moderador, MOTIVO))
        self.producto.refresh_from_db()
        self.assertTrue(self.producto.publicado)

    def test_moderacion_en_lote_informa_conteos(self):
        self.moderar(self.otro_producto)
        respuesta = self.accion(
            self.producto, self.otro_producto, self.producto_ajeno, confirmar="1", motivo=MOTIVO
        )
        mensajes = [str(m) for m in respuesta.wsgi_request._messages]
        self.assertIn("Productos retirados por moderación: 2.", mensajes)
        self.assertIn("Ya estaban moderados, sin cambios: 1.", mensajes)
        self.assertEqual(ModeracionProducto.objects.count(), 3)

    def test_no_edita_crea_ni_borra(self):
        url = f"{URL_ADMIN_PRODUCTOS}{self.producto.pk}/change/"
        respuesta = self.client.post(url, {"nombre": "Otro", "precio": "1.00", "publicado": ""})
        self.assertEqual(respuesta.status_code, 403)
        self.assertEqual(self.client.get(f"{URL_ADMIN_PRODUCTOS}add/").status_code, 403)
        self.assertEqual(
            self.client.post(
                f"{URL_ADMIN_PRODUCTOS}{self.producto.pk}/delete/", {"post": "yes"}
            ).status_code,
            403,
        )
        self.producto.refresh_from_db()
        self.assertEqual(
            (self.producto.nombre, self.producto.precio, self.producto.publicado),
            ("Sandalias de cuero natural", Decimal("850.00"), True),
        )

    def test_sin_permiso_de_moderar_no_hay_accion(self):
        lector = crear_administrador("88884444")
        lector.user_permissions.add(Permission.objects.get(codename="view_producto"))
        self.client.force_login(lector)
        respuesta = self.client.get(URL_ADMIN_PRODUCTOS)
        self.assertEqual(respuesta.status_code, 200)
        self.assertIsNone(respuesta.context["action_form"])
        self.accion(self.producto, confirmar="1", motivo=MOTIVO)
        self.assertFalse(ModeracionProducto.objects.exists())

    def test_superusuario_tampoco_edita_el_producto(self):
        superusuario = Usuario.objects.create_superuser(
            telefono="89990000", password=PASSWORD, nombre="Mantenimiento"
        )
        self.client.force_login(superusuario)
        detalle = self.client.get(f"{URL_ADMIN_PRODUCTOS}{self.producto.pk}/change/")
        self.assertIn("precio", detalle.context["adminform"].readonly_fields)
        self.assertEqual(self.client.get(f"{URL_ADMIN_PRODUCTOS}add/").status_code, 403)

    def test_accion_exige_csrf(self):
        cliente = Client(enforce_csrf_checks=True)
        cliente.force_login(self.moderador)
        respuesta = cliente.post(
            URL_ADMIN_PRODUCTOS,
            {
                "action": "moderar",
                helpers.ACTION_CHECKBOX_NAME: [self.producto.pk],
                "confirmar": "1",
                "motivo": MOTIVO,
            },
        )
        self.assertEqual(respuesta.status_code, 403)
        self.assertFalse(ModeracionProducto.objects.exists())
