from datetime import timedelta
from unittest.mock import patch

from django.db import IntegrityError
from django.utils import timezone

from apps.catalogo import services as catalogo
from apps.catalogo.tests.base import crear_producto
from apps.solicitudes import services
from apps.solicitudes.models import (
    MAX_CARACTERISTICAS,
    EstadoSolicitud,
    RenglonSolicitud,
    Solicitud,
)

from .base import SolicitudesAPITestCase, datos_renglon


class CreacionTests(SolicitudesAPITestCase):
    def test_un_renglon_deriva_comprador_y_taller(self):
        respuesta = self.enviar(datos_renglon(self.producto))
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        solicitud = Solicitud.objects.get()
        self.assertEqual(solicitud.comprador, self.comprador)
        self.assertEqual(solicitud.taller, self.taller)
        self.assertEqual(solicitud.estado, EstadoSolicitud.PENDIENTE_REVISION)
        self.assertEqual(respuesta.data["renglones"][0]["resolucion"], "pendiente")

    def test_varios_productos_del_mismo_taller(self):
        respuesta = self.enviar(datos_renglon(self.producto), datos_renglon(self.otro_producto))
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.assertEqual(RenglonSolicitud.objects.count(), 2)
        self.assertEqual([r["posicion"] for r in respuesta.data["renglones"]], [1, 2])

    def test_permite_repetir_producto_deliberadamente(self):
        respuesta = self.enviar(
            datos_renglon(self.producto),
            datos_renglon(self.producto, modalidad="produccion", fecha_solicitada=str(self.fecha)),
        )
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.assertEqual(RenglonSolicitud.objects.count(), 2)

    def test_lista_vacia(self):
        self.assertEqual(self.enviar().status_code, 400)
        self.assertFalse(Solicitud.objects.exists())

    def test_requiere_lista_de_renglones(self):
        for datos in ({}, {"renglones": None}, {"renglones": {}}, {"renglones": [None]}):
            with self.subTest(datos=datos):
                self.assertEqual(self.publicar(datos).status_code, 400)

    def test_rechaza_campos_privilegiados_del_agregado(self):
        for campo in (
            "comprador",
            "comprador_id",
            "taller",
            "taller_id",
            "propietario",
            "estado",
            "id",
            "creado_en",
            "actualizado_en",
            "propuesta",
            "pedido",
            "reservas",
            "pagos",
            "total",
        ):
            with self.subTest(campo=campo):
                datos = {"renglones": [datos_renglon(self.producto)], campo: 1}
                respuesta = self.publicar(datos)
                self.assertEqual(respuesta.status_code, 400)
                self.assertIn(campo, respuesta.data)
        self.assertFalse(Solicitud.objects.exists())

    def test_rechaza_campos_privilegiados_del_renglon(self):
        for campo in (
            "resolucion",
            "motivo_rechazo",
            "precio",
            "precio_unitario",
            "subtotal",
            "taller",
            "posicion",
            "cantidad_propuesta",
            "nueva_cantidad",
            "contraoferta",
            "desconocido",
        ):
            with self.subTest(campo=campo):
                respuesta = self.enviar(datos_renglon(self.producto, **{campo: 1}))
                self.assertEqual(respuesta.status_code, 400)
                self.assertIn(campo, respuesta.data["renglones"][0])

    def test_cantidad_uno(self):
        self.assertEqual(self.enviar(datos_renglon(self.producto, cantidad=1)).status_code, 201)

    def test_cantidad_cero(self):
        self.assertEqual(self.enviar(datos_renglon(self.producto, cantidad=0)).status_code, 400)

    def test_cantidad_negativa(self):
        self.assertEqual(self.enviar(datos_renglon(self.producto, cantidad=-1)).status_code, 400)

    def test_cantidad_fraccionaria(self):
        self.assertEqual(self.enviar(datos_renglon(self.producto, cantidad=1.5)).status_code, 400)

    def test_no_acepta_float_ni_booleano_como_entero(self):
        for cantidad in (1.0, True, False, None, "texto", 2147483648):
            with self.subTest(cantidad=cantidad):
                self.assertEqual(
                    self.enviar(datos_renglon(self.producto, cantidad=cantidad)).status_code, 400
                )

    def test_cantidad_es_obligatoria(self):
        renglon = datos_renglon(self.producto)
        del renglon["cantidad"]
        self.assertEqual(self.enviar(renglon).status_code, 400)

    def test_no_consulta_stock_mock_para_cantidad(self):
        respuesta = self.enviar(datos_renglon(self.producto, cantidad=100000))
        self.assertEqual(respuesta.status_code, 201)
        self.assertEqual(RenglonSolicitud.objects.get().cantidad, 100000)

    def test_stock_no_requiere_datos_de_otras_modalidades(self):
        respuesta = self.enviar(datos_renglon(self.producto))
        self.assertEqual(respuesta.status_code, 201)
        renglon = RenglonSolicitud.objects.get()
        self.assertIsNone(renglon.fecha_solicitada)
        self.assertEqual(renglon.caracteristicas, "")
        self.assertEqual(renglon.origen_personalizacion, "")

    def test_produccion_conserva_fecha(self):
        respuesta = self.enviar(
            datos_renglon(
                self.producto, modalidad="produccion", fecha_solicitada=str(self.fecha), cantidad=7
            )
        )
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.assertEqual(RenglonSolicitud.objects.get().fecha_solicitada, self.fecha)

    def test_produccion_exige_fecha(self):
        respuesta = self.enviar(datos_renglon(self.producto, modalidad="produccion"))
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("fecha_solicitada", respuesta.data["renglones"][0])

    def test_produccion_admite_hoy(self):
        respuesta = self.enviar(
            datos_renglon(
                self.producto, modalidad="produccion", fecha_solicitada=str(timezone.localdate())
            )
        )
        self.assertEqual(respuesta.status_code, 201)

    def test_produccion_rechaza_fecha_pasada(self):
        respuesta = self.enviar(
            datos_renglon(
                self.producto,
                modalidad="produccion",
                fecha_solicitada=str(timezone.localdate() - timedelta(days=1)),
            )
        )
        self.assertEqual(respuesta.status_code, 400)

    def test_produccion_rechaza_fecha_invalida(self):
        for fecha in ("2026-02-30", "texto", "", None):
            with self.subTest(fecha=fecha):
                self.assertEqual(
                    self.enviar(
                        datos_renglon(self.producto, modalidad="produccion", fecha_solicitada=fecha)
                    ).status_code,
                    400,
                )

    def test_personalizacion_desde_cero(self):
        respuesta = self.enviar(
            datos_renglon(
                self.producto,
                modalidad="personalizacion",
                caracteristicas="Azul, con iniciales",
                origen_personalizacion="desde_cero",
            )
        )
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        renglon = RenglonSolicitud.objects.get()
        self.assertEqual(renglon.caracteristicas, "Azul, con iniciales")
        self.assertEqual(renglon.origen_personalizacion, "desde_cero")

    def test_personalizacion_unidad_estandar(self):
        respuesta = self.enviar(
            datos_renglon(
                self.producto,
                modalidad="personalizacion",
                caracteristicas="Inicial A",
                origen_personalizacion="unidad_estandar",
            )
        )
        self.assertEqual(respuesta.status_code, 201)
        self.assertEqual(RenglonSolicitud.objects.get().origen_personalizacion, "unidad_estandar")

    def test_personalizacion_exige_caracteristicas(self):
        respuesta = self.enviar(
            datos_renglon(
                self.producto, modalidad="personalizacion", origen_personalizacion="desde_cero"
            )
        )
        self.assertEqual(respuesta.status_code, 400)

    def test_personalizacion_rechaza_caracteristicas_en_blanco(self):
        respuesta = self.enviar(
            datos_renglon(
                self.producto,
                modalidad="personalizacion",
                caracteristicas=" \n ",
                origen_personalizacion="desde_cero",
            )
        )
        self.assertEqual(respuesta.status_code, 400)

    def test_personalizacion_exige_origen(self):
        respuesta = self.enviar(
            datos_renglon(
                self.producto,
                modalidad="personalizacion",
                caracteristicas="Rojo",
            )
        )
        self.assertEqual(respuesta.status_code, 400)

    def test_rechaza_origen_desconocido(self):
        respuesta = self.enviar(
            datos_renglon(
                self.producto,
                modalidad="personalizacion",
                caracteristicas="Rojo",
                origen_personalizacion="inventado",
            )
        )
        self.assertEqual(respuesta.status_code, 400)

    def test_solicitud_mixta(self):
        respuesta = self.enviar(
            datos_renglon(self.producto),
            datos_renglon(self.producto, modalidad="produccion", fecha_solicitada=str(self.fecha)),
            datos_renglon(
                self.producto,
                modalidad="personalizacion",
                caracteristicas="Azul",
                origen_personalizacion="unidad_estandar",
            ),
        )
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.assertEqual(
            [r["modalidad"] for r in respuesta.data["renglones"]],
            ["stock", "produccion", "personalizacion"],
        )

    def test_modalidad_no_admitida_por_producto(self):
        respuesta = self.enviar(
            datos_renglon(
                self.otro_producto, modalidad="produccion", fecha_solicitada=str(self.fecha)
            )
        )
        self.assertEqual(respuesta.status_code, 400)

    def test_modalidad_invalida(self):
        for modalidad in ("", "pieza_unica", "mixto", None):
            with self.subTest(modalidad=modalidad):
                self.assertEqual(
                    self.enviar(datos_renglon(self.producto, modalidad=modalidad)).status_code, 400
                )

    def test_rechaza_datos_de_otra_modalidad(self):
        for extra in (
            {"fecha_solicitada": str(self.fecha)},
            {"caracteristicas": "Rojo"},
            {"origen_personalizacion": "desde_cero"},
        ):
            with self.subTest(extra=extra):
                self.assertEqual(
                    self.enviar(datos_renglon(self.producto, **extra)).status_code, 400
                )

    def test_mezclar_talleres_no_persiste_nada(self):
        respuesta = self.enviar(datos_renglon(self.producto), datos_renglon(self.producto_ajeno))
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("producto", respuesta.data["renglones"][1])
        self.assertFalse(Solicitud.objects.exists())
        self.assertFalse(RenglonSolicitud.objects.exists())

    def test_un_renglon_invalido_no_deja_agregado_parcial(self):
        respuesta = self.enviar(
            datos_renglon(self.producto), datos_renglon(self.producto, modalidad="produccion")
        )
        self.assertEqual(respuesta.status_code, 400)
        self.assertFalse(Solicitud.objects.exists())
        self.assertFalse(RenglonSolicitud.objects.exists())

    def test_producto_inexistente(self):
        respuesta = self.enviar(datos_renglon(self.producto, producto=9999999))
        self.assertEqual(respuesta.status_code, 400)
        self.assertFalse(Solicitud.objects.exists())

    def test_producto_despublicado(self):
        catalogo.despublicar_producto(self.producto)
        self.assertEqual(self.enviar(datos_renglon(self.producto)).status_code, 400)

    def test_producto_de_taller_no_aprobado(self):
        for taller in (self.taller_pendiente, self.taller_rechazado):
            with self.subTest(taller=taller):
                # Simula una escritura ajena al API: la selección pública también debe excluirla.
                producto = crear_producto(self.taller, self.categoria, publicado=True)
                type(producto).objects.filter(pk=producto.pk).update(taller=taller)
                self.assertEqual(self.enviar(datos_renglon(producto)).status_code, 400)

    def test_producto_invalido_no_revela_existencia(self):
        catalogo.despublicar_producto(self.producto)
        oculto = self.enviar(datos_renglon(self.producto))
        inexistente = self.enviar(datos_renglon(self.producto, producto=9999999))
        self.assertEqual(oculto.data, inexistente.data)

    def test_rollback_si_falla_la_insercion_de_renglones(self):
        with patch.object(RenglonSolicitud.objects, "bulk_create", side_effect=IntegrityError):
            with self.assertRaises(IntegrityError):
                self.crear()
        self.assertFalse(Solicitud.objects.exists())

    def test_servicio_rechaza_comprador_no_valido(self):
        with self.assertRaises(services.CompradorNoValido):
            services.crear_solicitud(
                comprador=self.artesano, renglones=[datos_renglon(self.producto)]
            )

    def test_servicio_rechaza_lista_vacia(self):
        with self.assertRaises(services.SolicitudInvalida):
            services.crear_solicitud(comprador=self.comprador, renglones=[])

    def test_limite_de_renglones(self):
        maximo = [datos_renglon(self.producto)] * services.MAX_RENGLONES
        self.assertEqual(self.enviar(*maximo).status_code, 201)
        self.assertEqual(self.enviar(*maximo, datos_renglon(self.producto)).status_code, 400)
        self.assertEqual(Solicitud.objects.count(), 1)

    def test_servicio_rechaza_exceso_de_renglones(self):
        with self.assertRaises(services.SolicitudInvalida):
            self.crear(*[datos_renglon(self.producto)] * (services.MAX_RENGLONES + 1))

    def test_limite_de_caracteristicas(self):
        for largo, esperado in ((MAX_CARACTERISTICAS, 201), (MAX_CARACTERISTICAS + 1, 400)):
            with self.subTest(largo=largo):
                respuesta = self.enviar(
                    datos_renglon(
                        self.producto,
                        modalidad="personalizacion",
                        caracteristicas="a" * largo,
                        origen_personalizacion="desde_cero",
                    )
                )
                self.assertEqual(respuesta.status_code, esperado)

    def test_servicio_rechaza_caracteristicas_demasiado_largas(self):
        with self.assertRaises(services.SolicitudInvalida):
            self.crear(
                datos_renglon(
                    self.producto,
                    modalidad="personalizacion",
                    caracteristicas="a" * (MAX_CARACTERISTICAS + 1),
                    origen_personalizacion="desde_cero",
                )
            )

    def test_servicio_rechaza_campos_fuera_del_contrato(self):
        with self.assertRaises(services.SolicitudInvalida):
            self.crear(datos_renglon(self.producto, resolucion="aceptado"))
