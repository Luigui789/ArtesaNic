from unittest.mock import patch

from django.db import IntegrityError, transaction

from apps.notificaciones.models import Notificacion
from apps.notificaciones.services import ColisionNotificacion, emitir
from apps.solicitudes.tests.base import SolicitudesAPITestCase


class NotificacionesTest(SolicitudesAPITestCase):
    def setUp(self):
        super().setUp()
        self.solicitud = self.crear()
        self.aviso = Notificacion.objects.get(tipo="solicitud_recibida")

    def test_evento_y_dedupe_colision(self):
        self.assertEqual(self.aviso.destinatario_id, self.artesano.pk)
        self.assertEqual(self.aviso.solicitud_id, self.solicitud.pk)
        datos = dict(
            destinatario_id=self.artesano.pk,
            tipo=self.aviso.tipo,
            clave_evento=self.aviso.clave_evento,
            solicitud_id=self.solicitud.pk,
        )
        self.assertEqual(emitir(**datos).pk, self.aviso.pk)
        with self.assertLogs("apps.notificaciones.services", level="CRITICAL"):
            with self.assertRaises(ColisionNotificacion):
                emitir(**(datos | {"tipo": "solicitud_rechazada"}))
        self.assertEqual(Notificacion.objects.count(), 1)

    def test_restricciones_y_contenido_inmutable(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Notificacion.objects.create(
                destinatario=self.comprador,
                tipo="solicitud_recibida",
                clave_evento="sin-referencia",
            )
        self.aviso.tipo = "solicitud_rechazada"
        from django.core.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            self.aviso.save()
        with self.assertRaises(ValidationError):
            self.aviso.delete()

    def test_no_borrado_ni_edicion_por_queryset(self):
        from django.core.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            Notificacion.objects.filter(pk=self.aviso.pk).update(tipo="solicitud_rechazada")
        with self.assertRaises(ValidationError):
            Notificacion.objects.filter(pk=self.aviso.pk).delete()

    def test_privacidad_admin(self):
        from django.apps import apps
        from django.contrib import admin
        from django.test import Client

        from apps.talleres.tests.base import crear_administrador

        self.assertFalse(
            any(
                model in admin.site._registry
                for model in apps.get_app_config("notificaciones").get_models()
            )
        )
        administrador = crear_administrador("88881234")
        cliente = Client()
        cliente.force_login(administrador)
        self.assertEqual(cliente.get("/admin/notificaciones/").status_code, 404)
        self.assertEqual(cliente.get("/api/v1/notificaciones/").status_code, 401)
        self.client.force_authenticate(user=administrador)
        self.assertEqual(self.client.get("/api/v1/notificaciones/").status_code, 403)

    def test_rollback_descarta_aviso_y_tipo_invalido(self):
        with self.assertRaises(RuntimeError), transaction.atomic():
            emitir(
                destinatario_id=self.comprador.pk,
                tipo="solicitud_rechazada",
                clave_evento="rollback",
                solicitud_id=self.solicitud.pk,
            )
            raise RuntimeError("rollback")
        self.assertFalse(Notificacion.objects.filter(clave_evento="rollback").exists())
        with self.assertRaises(ValueError):
            emitir(
                destinatario_id=self.comprador.pk,
                tipo="otro",
                clave_evento="invalido",
                solicitud_id=self.solicitud.pk,
            )

    def test_api_privada_lectura_idempotente(self):
        url = "/api/v1/notificaciones/"
        self.anonimo()
        self.assertEqual(self.client.get(url).status_code, 401)
        self.autenticar(self.comprador)
        self.assertEqual(self.client.get(url).data["count"], 0)
        self.assertEqual(self.client.post(f"{url}{self.aviso.pk}/leer/").status_code, 404)
        self.autenticar(self.artesano)
        respuesta = self.client.get(url)
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data["count"], 1)
        self.assertEqual(
            set(respuesta.data["results"][0]),
            {
                "id",
                "tipo",
                "titulo",
                "detalle",
                "solicitud_id",
                "pedido_id",
                "creada_en",
                "leida",
                "leida_en",
            },
        )
        self.assertIn("no-store", respuesta["Cache-Control"])
        primera = self.client.post(f"{url}{self.aviso.pk}/leer/")
        segunda = self.client.post(f"{url}{self.aviso.pk}/leer/")
        self.assertEqual(primera.data["leida_en"], segunda.data["leida_en"])
        self.assertEqual(self.client.get(url + "resumen/").data["no_leidas"], 0)
        self.assertEqual(self.client.post(url + "leer-todas/").data["actualizadas"], 0)

    def test_paginacion_y_lectura_masiva_solo_propias(self):
        for i in range(22):
            emitir(
                destinatario_id=self.artesano.pk,
                tipo="solicitud_recibida",
                clave_evento=f"pagina:{i}",
                solicitud_id=self.solicitud.pk,
            )
        emitir(
            destinatario_id=self.comprador.pk,
            tipo="solicitud_rechazada",
            clave_evento="otro",
            solicitud_id=self.solicitud.pk,
        )
        self.autenticar(self.artesano)
        primera = self.client.get("/api/v1/notificaciones/").data
        self.assertEqual(primera["count"], 23)
        self.assertEqual(len(primera["results"]), 20)
        self.assertEqual(len(self.client.get("/api/v1/notificaciones/?page=2").data["results"]), 3)
        self.assertEqual(
            self.client.post("/api/v1/notificaciones/leer-todas/").data["actualizadas"], 23
        )
        self.assertEqual(
            self.client.post("/api/v1/notificaciones/leer-todas/").data["actualizadas"], 0
        )
        self.assertEqual(
            Notificacion.objects.filter(destinatario=self.comprador, leida_en__isnull=True).count(),
            1,
        )

    def test_solicitud_idempotente_y_rechazo_final(self):
        from uuid import uuid4

        from apps.solicitudes import services
        from apps.solicitudes.tests.base import datos_renglon

        datos = dict(
            comprador=self.comprador, clave=str(uuid4()), renglones=[datos_renglon(self.producto)]
        )
        primero = services.crear_solicitud_idempotente(**datos)
        segundo = services.crear_solicitud_idempotente(**datos)
        self.assertFalse(primero.repetida)
        self.assertTrue(segundo.repetida)
        self.assertEqual(Notificacion.objects.filter(tipo="solicitud_recibida").count(), 2)
        renglon = self.solicitud.renglones.get()
        services.resolver_renglon(
            artesano=self.artesano,
            solicitud_id=self.solicitud.pk,
            renglon_id=renglon.pk,
            resolucion="rechazado",
            motivo_rechazo="No disponible",
        )
        self.assertEqual(
            Notificacion.objects.filter(
                tipo="solicitud_rechazada", solicitud=self.solicitud, destinatario=self.comprador
            ).count(),
            1,
        )

    def test_error_aviso_revierte_solicitud(self):
        from apps.solicitudes.models import Solicitud

        antes = Solicitud.objects.count()
        with patch("apps.notificaciones.eventos.emitir", side_effect=RuntimeError("fallo")):
            with self.assertRaises(RuntimeError):
                self.crear()
        self.assertEqual(Solicitud.objects.count(), antes)

    def test_sin_backfill_y_sin_notificacion_de_chat(self):
        from apps.mensajes.services import enviar_mensaje
        from apps.pagos.tests.base import confirmar_pedido

        pedido = confirmar_pedido(
            comprador=self.comprador, artesano=self.artesano, producto=self.producto
        )
        antes = Notificacion.objects.count()
        enviar_mensaje(actor=self.comprador, pedido_id=pedido.pk, texto="mensaje privado")
        self.assertEqual(Notificacion.objects.count(), antes)
