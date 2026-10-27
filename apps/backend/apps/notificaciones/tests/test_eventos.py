from django.utils import timezone

from apps.notificaciones.models import Notificacion
from apps.pedidos import cumplimiento
from apps.pedidos.tests.base_cumplimiento import stock
from apps.pedidos.tests.base_resolucion import ResolucionTestCase


class EventosComercialesTest(ResolucionTestCase):
    def verificar(self, tipo, destinatario, pedido):
        aviso = Notificacion.objects.get(tipo=tipo, pedido=pedido, destinatario=destinatario)
        self.assertIsNone(aviso.solicitud_id)
        self.assertTrue(aviso.clave_evento.startswith(tipo + ":"))
        return aviso

    def test_propuesta_pago_cumplimiento_entrega_y_recepcion(self):
        pedido = self.pedido(stock(self.base, 2))
        self.assertEqual(
            Notificacion.objects.filter(
                tipo="solicitud_recibida", solicitud=pedido.solicitud, destinatario=self.artesano
            ).count(),
            1,
        )
        self.assertEqual(
            Notificacion.objects.filter(
                tipo="propuesta_lista", solicitud=pedido.solicitud, destinatario=self.comprador
            ).count(),
            1,
        )
        for tipo, usuario in [
            ("propuesta_aceptada", self.artesano),
            ("pago_registrado", self.artesano),
            ("pago_confirmado", self.comprador),
        ]:
            self.verificar(tipo, usuario, pedido)
        linea = pedido.lineas.get()
        cumplimiento.iniciar_linea(artesano=self.artesano, pedido_id=pedido.pk, linea_id=linea.pk)
        entrega = cumplimiento.registrar_entrega(
            artesano=self.artesano,
            pedido_id=pedido.pk,
            fecha=timezone.localdate(),
            lineas=[{"linea": linea.pk, "cantidad": 2}],
        )
        cumplimiento.registrar_recepcion(
            comprador=self.comprador,
            pedido_id=pedido.pk,
            entrega_id=entrega.pk,
            resultado="discrepancia",
            motivo="Falta un detalle",
        )
        for tipo, usuario in [
            ("pedido_en_cumplimiento", self.comprador),
            ("entrega_registrada", self.comprador),
            ("pedido_entregado", self.comprador),
            ("discrepancia_entrega", self.artesano),
        ]:
            self.verificar(tipo, usuario, pedido)

    def test_cancelacion_y_reembolso_comparten_transaccion(self):
        pedido = self.pedido(stock(self.base, 2))
        respuesta = self.cancelar(pedido)
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.verificar("pedido_cancelado_artesano", self.comprador, pedido)
        self.verificar("reembolso_creado", self.comprador, pedido)
        respuesta = self.devolver(pedido)
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.verificar("reembolso_realizado", self.comprador, pedido)

    def test_observacion_correccion_y_reintento_idempotente(self):
        from uuid import uuid4

        from apps.pagos import services as pagos
        from apps.pagos.comprobantes import validar_comprobante
        from apps.pagos.tests.base import imagen

        pedido = self.pedido(stock(self.base, 2), pago=None)
        datos = dict(
            comprador=self.comprador,
            clave=str(uuid4()),
            pedido_id=pedido.pk,
            metodo="transferencia",
            referencia="dato privado",
            comprobante=validar_comprobante(imagen()),
        )
        pagos.registrar_intento_idempotente(**datos)
        pagos.registrar_intento_idempotente(**datos)
        self.assertEqual(
            Notificacion.objects.filter(tipo="pago_registrado", pedido=pedido).count(), 1
        )
        intento = pedido.pago.intentos.get()
        pagos.resolver_intento(
            artesano=self.artesano,
            pedido_id=pedido.pk,
            intento_id=intento.pk,
            resultado="observado",
            motivo="Motivo privado",
        )
        self.verificar("pago_observado", self.comprador, pedido)
        pagos.corregir_intento(
            comprador=self.comprador,
            pedido_id=pedido.pk,
            intento_id=intento.pk,
            metodo="transferencia",
            referencia="otra referencia",
            comprobante=validar_comprobante(imagen()),
        )
        self.verificar("pago_corregido", self.artesano, pedido)
        self.autenticar(self.comprador)
        contenido = str(self.client.get("/api/v1/notificaciones/").data)
        self.assertNotIn("Motivo privado", contenido)
        self.assertNotIn("dato privado", contenido)

    def test_cierre_parcial_objetado_y_aceptado(self):
        pedido = self.pedido(stock(self.base, 2))
        linea = pedido.lineas.get()
        self.iniciar_srv(pedido, linea)
        self.entregar_srv(pedido, (linea, 1))
        primero = self.proponer(pedido).data["cierres_parciales"][0]
        self.verificar("cierre_parcial_propuesto", self.comprador, pedido)
        self.assertEqual(
            self.responder(pedido, primero["id"], "objetado", "Prefiero esperar").status_code, 201
        )
        self.verificar("cierre_parcial_objetado", self.artesano, pedido)
        segundo = self.proponer(pedido).data["cierres_parciales"][-1]
        self.assertEqual(self.responder(pedido, segundo["id"], "aceptado").status_code, 201)
        self.verificar("pedido_cerrado_parcial", self.artesano, pedido)
        self.verificar("reembolso_creado", self.comprador, pedido)

    def test_vencimiento_avisa_a_ambas_partes_una_vez(self):
        from apps.pagos.models import PLAZO
        from apps.pagos.tests.base import reloj
        from apps.pedidos import vencimiento

        pedido = self.pedido(stock(self.base), pago=None)
        with reloj(pedido.confirmado_en + PLAZO):
            self.assertTrue(vencimiento.vencer_pedido(pedido.pk))
            self.assertFalse(vencimiento.vencer_pedido(pedido.pk))
        self.verificar("pedido_vencido_falta_pago", self.comprador, pedido)
        self.verificar("pedido_vencido_falta_pago", self.artesano, pedido)

    def test_propuesta_rechazada(self):
        from decimal import Decimal

        from apps.propuestas import services as propuestas
        from apps.solicitudes import services as solicitudes

        solicitud = solicitudes.crear_solicitud(
            comprador=self.comprador, renglones=[stock(self.base)]
        )
        renglon = solicitud.renglones.get()
        solicitudes.resolver_renglon(
            artesano=self.artesano,
            solicitud_id=solicitud.pk,
            renglon_id=renglon.pk,
            resolucion="aceptado",
        )
        propuestas.finalizar_propuesta(
            artesano=self.artesano,
            solicitud_id=solicitud.pk,
            modalidad_entrega="entrega_artesano",
            costo_entrega=Decimal("50.00"),
            lineas=[{"renglon": renglon.pk}],
        )
        propuestas.decidir_propuesta(
            comprador=self.comprador, solicitud_id=solicitud.pk, decision="rechazar"
        )
        self.assertEqual(
            Notificacion.objects.filter(
                tipo="propuesta_rechazada", destinatario=self.artesano, solicitud=solicitud
            ).count(),
            1,
        )
        self.assertFalse(
            Notificacion.objects.filter(
                tipo="propuesta_rechazada", destinatario=self.comprador
            ).exists()
        )

    def test_pago_no_recibido(self):
        pedido = self.pedido(stock(self.base), pago="no_recibido")
        self.verificar("pago_no_recibido", self.comprador, pedido)

    def test_recepcion_confirmada(self):
        pedido = self.pedido(stock(self.base))
        linea = pedido.lineas.get()
        self.iniciar_srv(pedido, linea)
        entrega = self.entregar_srv(pedido, (linea, 1))
        cumplimiento.registrar_recepcion(
            comprador=self.comprador,
            pedido_id=pedido.pk,
            entrega_id=entrega.pk,
            resultado="confirmada",
        )
        self.verificar("recepcion_confirmada", self.artesano, pedido)

    def test_reintento_de_entrega_no_duplica_aviso(self):
        from uuid import uuid4

        pedido = self.pedido(stock(self.base, 2))
        linea = pedido.lineas.get()
        self.iniciar_srv(pedido, linea)
        clave = str(uuid4())
        self.assertEqual(self.entregar(pedido, (linea, 1), clave=clave).status_code, 201)
        self.assertEqual(self.entregar(pedido, (linea, 1), clave=clave).status_code, 201)
        self.assertEqual(
            Notificacion.objects.filter(tipo="entrega_registrada", pedido=pedido).count(), 1
        )
        self.assertEqual(pedido.entregas.count(), 1)
