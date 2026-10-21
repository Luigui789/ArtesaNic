"""RF-009/018, RN-002/005/006: consultas privadas sin acciones de propuesta o pedido."""

from django.core.paginator import Paginator
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.models import Rol
from apps.accounts.tests.base import crear_usuario
from apps.catalogo import services as catalogo
from apps.solicitudes.api.serializers import (
    SolicitudArtesanoSerializer,
    SolicitudCompradorSerializer,
)
from apps.solicitudes.models import EstadoSolicitud, RenglonSolicitud, ResolucionRenglon
from apps.solicitudes.selectors import solicitudes_con_renglones

from .base import (
    URL_CREAR,
    URL_MIAS,
    URL_RECIBIDAS,
    SolicitudesAPITestCase,
    datos_renglon,
    url_mia,
    url_recibida,
)


def claves_anidadas(valor):
    if isinstance(valor, dict):
        return set(valor).union(*(claves_anidadas(v) for v in valor.values()))
    if isinstance(valor, list):
        return set().union(*(claves_anidadas(v) for v in valor))
    return set()


class LecturaSolicitudesTests(SolicitudesAPITestCase):
    def setUp(self):
        super().setUp()
        self.solicitud = self.crear()

    def test_comprador_lista_solo_sus_solicitudes(self):
        self.crear(comprador=self.otro_comprador)
        respuesta = self.client.get(URL_MIAS)
        self.assertEqual(respuesta.status_code, 200)
        cuerpo = respuesta.json()
        self.assertEqual(cuerpo["count"], 1)
        self.assertEqual([s["id"] for s in cuerpo["results"]], [self.solicitud.pk])

    def test_comprador_sin_solicitudes_recibe_pagina_vacia(self):
        self.autenticar(self.otro_comprador)
        self.assertEqual(
            self.client.get(URL_MIAS).json(),
            {"count": 0, "next": None, "previous": None, "results": []},
        )

    def test_comprador_consulta_detalle_propio(self):
        respuesta = self.client.get(url_mia(self.solicitud.pk))
        self.assertEqual(respuesta.status_code, 200)
        cuerpo = respuesta.json()
        self.assertEqual(cuerpo["id"], self.solicitud.pk)
        self.assertEqual(cuerpo["estado"], EstadoSolicitud.PENDIENTE_REVISION)
        self.assertEqual(cuerpo["taller"], {"id": self.taller.pk, "nombre": self.taller.nombre})
        self.assertNotIn("comprador", cuerpo)

    def test_otro_comprador_no_distingue_solicitud_ajena_de_inexistente(self):
        self.autenticar(self.otro_comprador)
        ajena = self.client.get(url_mia(self.solicitud.pk))
        inexistente = self.client.get(url_mia(999999999))
        self.assertEqual(ajena.status_code, 404)
        self.assertEqual(inexistente.status_code, 404)
        self.assertEqual(ajena.json(), inexistente.json())

    def test_mias_no_acepta_elegir_otro_comprador_por_query(self):
        self.crear(comprador=self.otro_comprador)
        respuesta = self.client.get(URL_MIAS, {"comprador": self.otro_comprador.pk})
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual([s["id"] for s in respuesta.json()["results"]], [self.solicitud.pk])

    def test_comprador_no_consulta_recibidas(self):
        for ruta in (URL_RECIBIDAS, url_recibida(self.solicitud.pk)):
            with self.subTest(ruta=ruta):
                self.assertEqual(self.client.get(ruta).status_code, 403)

    def test_artesano_no_consulta_rutas_del_comprador(self):
        self.autenticar(self.artesano)
        for ruta in (URL_MIAS, url_mia(self.solicitud.pk)):
            with self.subTest(ruta=ruta):
                self.assertEqual(self.client.get(ruta).status_code, 403)

    def test_artesano_lista_solicitudes_de_su_taller_de_varios_compradores(self):
        otra = self.crear(comprador=self.otro_comprador)
        self.crear(datos_renglon(self.producto_ajeno))
        self.autenticar(self.artesano)
        respuesta = self.client.get(URL_RECIBIDAS)
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.json()["count"], 2)
        self.assertEqual(
            {s["id"] for s in respuesta.json()["results"]}, {self.solicitud.pk, otra.pk}
        )

    def test_artesano_consulta_recibida_con_identidad_minima_del_comprador(self):
        self.autenticar(self.artesano)
        respuesta = self.client.get(url_recibida(self.solicitud.pk))
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(
            respuesta.json()["comprador"],
            {"id": self.comprador.pk, "nombre": self.comprador.nombre},
        )

    def test_otro_artesano_no_distingue_recibida_ajena_de_inexistente(self):
        self.autenticar(self.artesano_ajeno)
        ajena = self.client.get(url_recibida(self.solicitud.pk))
        inexistente = self.client.get(url_recibida(999999999))
        self.assertEqual(ajena.status_code, 404)
        self.assertEqual(inexistente.status_code, 404)
        self.assertEqual(ajena.json(), inexistente.json())

    def test_artesano_sin_recibidas_recibe_pagina_vacia(self):
        self.autenticar(self.artesano_ajeno)
        respuesta = self.client.get(URL_RECIBIDAS)
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.json()["count"], 0)
        self.assertEqual(respuesta.json()["results"], [])

    def test_recibidas_no_acepta_elegir_otro_taller_por_query(self):
        self.crear(datos_renglon(self.producto_ajeno))
        self.autenticar(self.artesano)
        respuesta = self.client.get(URL_RECIBIDAS, {"taller": self.taller_ajeno.pk})
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual([s["id"] for s in respuesta.json()["results"]], [self.solicitud.pk])

    def test_lecturas_anonimas_responden_401(self):
        self.anonimo()
        for ruta in self.rutas_lectura():
            with self.subTest(ruta=ruta):
                self.assertEqual(self.client.get(ruta).status_code, 401)

    def test_token_invalido_responde_401(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer no-es-un-token")
        for ruta in self.rutas_lectura():
            with self.subTest(ruta=ruta):
                self.assertEqual(self.client.get(ruta).status_code, 401)

    def test_desactivar_comprador_invalida_el_acceso_con_token_emitido(self):
        self.comprador.is_active = False
        self.comprador.save(update_fields=["is_active"])
        for ruta in (URL_MIAS, url_mia(self.solicitud.pk)):
            with self.subTest(ruta=ruta):
                self.assertEqual(self.client.get(ruta).status_code, 401)

    def test_desactivar_artesano_invalida_el_acceso_con_token_emitido(self):
        self.autenticar(self.artesano)
        self.artesano.is_active = False
        self.artesano.save(update_fields=["is_active"])
        for ruta in (URL_RECIBIDAS, url_recibida(self.solicitud.pk)):
            with self.subTest(ruta=ruta):
                self.assertEqual(self.client.get(ruta).status_code, 401)

    def comprobar_artesano_no_habilitado(self, usuario):
        self.autenticar(usuario)
        for ruta in (URL_RECIBIDAS, url_recibida(self.solicitud.pk)):
            with self.subTest(ruta=ruta):
                self.assertEqual(self.client.get(ruta).status_code, 403)

    def test_artesano_pendiente_no_consulta_recibidas(self):
        self.comprobar_artesano_no_habilitado(self.taller_pendiente.propietario)

    def test_artesano_rechazado_no_consulta_recibidas(self):
        self.comprobar_artesano_no_habilitado(self.taller_rechazado.propietario)

    def test_artesano_sin_taller_no_consulta_recibidas(self):
        self.comprobar_artesano_no_habilitado(crear_usuario("89999999", rol=Rol.ARTESANO))

    def test_ninguna_lectura_expone_credenciales_o_datos_economicos(self):
        prohibidas = {
            "telefono",
            "password",
            "access",
            "refresh",
            "is_staff",
            "is_superuser",
            "precio",
            "precio_unitario",
            "total",
            "cotizacion",
            "cotizacion_congelada",
            "propuesta",
            "pedido",
            "reserva",
            "reservas",
            "pagos",
        }
        for usuario, rutas in (
            (self.comprador, (URL_MIAS, url_mia(self.solicitud.pk))),
            (self.artesano, (URL_RECIBIDAS, url_recibida(self.solicitud.pk))),
        ):
            self.autenticar(usuario)
            for ruta in rutas:
                with self.subTest(ruta=ruta):
                    respuesta = self.client.get(ruta)
                    self.assertEqual(respuesta.status_code, 200)
                    self.assertFalse(claves_anidadas(respuesta.json()) & prohibidas)

    def test_despublicar_producto_no_borra_ni_oculta_solicitud_existente(self):
        catalogo.despublicar_producto(self.producto)
        for usuario, ruta in (
            (self.comprador, url_mia(self.solicitud.pk)),
            (self.artesano, url_recibida(self.solicitud.pk)),
        ):
            self.autenticar(usuario)
            respuesta = self.client.get(ruta)
            self.assertEqual(respuesta.status_code, 200)
            self.assertEqual(respuesta.json()["renglones"][0]["producto"]["id"], self.producto.pk)
        self.assertEqual(self.solicitud.renglones.count(), 1)

    def test_lectura_conserva_orden_modalidad_y_datos_de_cada_renglon(self):
        solicitud = self.crear(
            datos_renglon(self.producto, cantidad=3),
            datos_renglon(self.producto, modalidad="produccion", fecha_solicitada=self.fecha),
            datos_renglon(
                self.producto,
                modalidad="personalizacion",
                caracteristicas="Bordado azul",
                origen_personalizacion="desde_cero",
            ),
        )
        respuesta = self.client.get(url_mia(solicitud.pk))
        self.assertEqual(respuesta.status_code, 200)
        renglones = respuesta.json()["renglones"]
        self.assertEqual([r["posicion"] for r in renglones], [1, 2, 3])
        self.assertEqual(
            [r["modalidad"] for r in renglones], ["stock", "produccion", "personalizacion"]
        )
        self.assertEqual(renglones[0]["cantidad"], 3)
        self.assertEqual(renglones[1]["fecha_solicitada"], self.fecha.isoformat())
        self.assertEqual(renglones[2]["caracteristicas"], "Bordado azul")
        self.assertEqual(renglones[2]["origen_personalizacion"], "desde_cero")
        self.assertTrue(all(r["resolucion"] == "pendiente" for r in renglones))

    def test_dr03_representado_conserva_los_rechazos_sin_crear_propuesta(self):
        # Estado estructural preparado para AUD-06: aquí no se implementa su transición.
        self.solicitud.renglones.update(
            resolucion=ResolucionRenglon.RECHAZADO, motivo_rechazo="No es posible elaborarlo."
        )
        type(self.solicitud).objects.filter(pk=self.solicitud.pk).update(
            estado=EstadoSolicitud.RECHAZADA
        )
        respuesta = self.client.get(url_mia(self.solicitud.pk))
        self.assertEqual(respuesta.status_code, 200)
        cuerpo = respuesta.json()
        self.assertEqual(cuerpo["estado"], "rechazada")
        self.assertEqual(cuerpo["renglones"][0]["resolucion"], "rechazado")
        self.assertEqual(cuerpo["renglones"][0]["motivo_rechazo"], "No es posible elaborarlo.")
        self.assertNotIn("propuesta", cuerpo)
        self.assertNotIn("pedido", cuerpo)

    def test_listado_pagina_las_solicitudes_y_conserva_sus_renglones(self):
        ultima = self.crear(datos_renglon(self.producto), datos_renglon(self.otro_producto))
        respuesta = self.client.get(URL_MIAS, {"page_size": 1})
        self.assertEqual(respuesta.status_code, 200)
        cuerpo = respuesta.json()
        self.assertEqual(cuerpo["count"], 2)
        self.assertIsNotNone(cuerpo["next"])
        self.assertIsNone(cuerpo["previous"])
        self.assertEqual(cuerpo["results"][0]["id"], ultima.pk)
        self.assertEqual(len(cuerpo["results"][0]["renglones"]), 2)
        segunda = self.client.get(URL_MIAS, {"page_size": 1, "page": 2}).json()
        self.assertEqual(segunda["results"][0]["id"], self.solicitud.pk)
        self.assertIsNone(segunda["next"])
        self.assertIsNotNone(segunda["previous"])

    def test_pagina_inexistente_responde_404(self):
        self.assertEqual(self.client.get(URL_MIAS, {"page": 999}).status_code, 404)

    def test_lecturas_privadas_no_se_guardan_en_cache(self):
        for usuario, rutas in (
            (self.comprador, (URL_MIAS, url_mia(self.solicitud.pk))),
            (self.artesano, (URL_RECIBIDAS, url_recibida(self.solicitud.pk))),
        ):
            self.autenticar(usuario)
            for ruta in rutas:
                with self.subTest(ruta=ruta):
                    respuesta = self.client.get(ruta)
                    self.assertEqual(respuesta.status_code, 200)
                    self.assertIn("no-store", respuesta["Cache-Control"])
                    self.assertIn("private", respuesta["Cache-Control"])

    def test_rutas_de_lectura_no_admiten_mutaciones(self):
        for usuario, rutas in (
            (self.comprador, (URL_MIAS, url_mia(self.solicitud.pk))),
            (self.artesano, (URL_RECIBIDAS, url_recibida(self.solicitud.pk))),
        ):
            self.autenticar(usuario)
            for ruta in rutas:
                for metodo in ("post", "put", "patch", "delete"):
                    with self.subTest(ruta=ruta, metodo=metodo):
                        respuesta = getattr(self.client, metodo)(ruta, {}, format="json")
                        self.assertEqual(respuesta.status_code, 405)

    def test_ruta_de_alta_no_admite_lectura_o_edicion(self):
        self.assertEqual(self.client.get(URL_CREAR).status_code, 405)
        for metodo in ("put", "patch", "delete"):
            with self.subTest(metodo=metodo):
                self.assertEqual(
                    getattr(self.client, metodo)(URL_CREAR, {}, format="json").status_code, 405
                )

    def rutas_lectura(self):
        return (
            URL_MIAS,
            url_mia(self.solicitud.pk),
            URL_RECIBIDAS,
            url_recibida(self.solicitud.pk),
        )


class ConsultasSolicitudesTests(SolicitudesAPITestCase):
    def setUp(self):
        super().setUp()
        self.solicitud = self.crear()

    def agregar_renglones(self):
        for posicion in range(2, 10):
            RenglonSolicitud.objects.create(
                solicitud=self.solicitud,
                producto=self.producto,
                posicion=posicion,
                modalidad="stock",
                cantidad=posicion,
            )

    def test_selector_detalle_y_serializacion_usan_dos_consultas(self):
        self.agregar_renglones()
        for serializer in (SolicitudCompradorSerializer, SolicitudArtesanoSerializer):
            with self.subTest(serializer=serializer.__name__), self.assertNumQueries(2):
                solicitud = solicitudes_con_renglones().get(pk=self.solicitud.pk)
                self.assertEqual(len(serializer(solicitud).data["renglones"]), 9)

    def test_selector_listado_paginado_y_serializacion_usan_tres_consultas(self):
        self.agregar_renglones()
        self.crear(datos_renglon(self.producto), datos_renglon(self.otro_producto))
        with self.assertNumQueries(3):
            consulta = solicitudes_con_renglones().del_comprador(self.comprador)
            pagina = Paginator(consulta, 12).page(1)
            cuerpo = SolicitudCompradorSerializer(pagina.object_list, many=True).data
            self.assertEqual(len(cuerpo), 2)
            self.assertEqual(sum(len(s["renglones"]) for s in cuerpo), 11)

    def test_api_comprador_no_agrega_consultas_por_cada_renglon(self):
        rutas = (url_mia(self.solicitud.pk), URL_MIAS)
        cantidades = []
        for ruta in rutas:
            with CaptureQueriesContext(connection) as consultas:
                self.assertEqual(self.client.get(ruta).status_code, 200)
            cantidades.append(len(consultas))
        self.agregar_renglones()
        for ruta, cantidad in zip(rutas, cantidades, strict=True):
            with self.subTest(ruta=ruta), self.assertNumQueries(cantidad):
                self.assertEqual(self.client.get(ruta).status_code, 200)
        self.assertEqual(cantidades, [3, 4])

    def test_api_artesano_no_agrega_consultas_por_cada_renglon(self):
        self.autenticar(self.artesano)
        rutas = (url_recibida(self.solicitud.pk), URL_RECIBIDAS)
        cantidades = []
        for ruta in rutas:
            with CaptureQueriesContext(connection) as consultas:
                self.assertEqual(self.client.get(ruta).status_code, 200)
            cantidades.append(len(consultas))
        self.agregar_renglones()
        for ruta, cantidad in zip(rutas, cantidades, strict=True):
            with self.subTest(ruta=ruta), self.assertNumQueries(cantidad):
                self.assertEqual(self.client.get(ruta).status_code, 200)
        self.assertEqual(cantidades, [4, 5])
