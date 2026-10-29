"""Privacidad de la conversación: sin PII adicional, sin Admin y sin texto en logs
(AUD-16; RN-006, RNF-013; D-AUD16-09)."""

import json

from django.apps import apps
from django.contrib import admin
from django.test import Client

from apps.accounts.models import Usuario
from apps.accounts.tests.base import PASSWORD
from apps.pagos import services as pagos
from apps.pagos.comprobantes import validar_comprobante
from apps.pagos.tests.base import imagen

from .base import MensajesAPITestCase

SECRETO = "Texto confidencial de la conversación 7731"


def claves(valor) -> set[str]:
    """Todas las claves de un JSON anidado: ningún campo nuevo pasa inadvertido."""
    if isinstance(valor, dict):
        return set(valor).union(*(claves(v) for v in valor.values()))
    if isinstance(valor, list):
        return set().union(*(claves(v) for v in valor))
    return set()


class PrivacidadRespuestasTests(MensajesAPITestCase):
    def setUp(self):
        super().setUp()
        pagos.registrar_intento(
            comprador=self.comprador,
            pedido_id=self.pedido.pk,
            metodo="transferencia",
            referencia="TRX-PRIVADA-123",
            comprobante=validar_comprobante(imagen()),
        )

    def test_sin_telefonos_privilegios_ni_pagos(self):
        respuestas = [
            self.enviar("Hola", como=self.comprador).content.decode(),
            self.enviar("Respuesta", como=self.artesano).content.decode(),
            self.leer(como=self.comprador).content.decode(),
            self.leer(como=self.artesano).content.decode(),
        ]
        prohibidos = (
            self.comprador.telefono,
            self.artesano.telefono,
            "TRX-PRIVADA-123",
            "comprobante",
            "private_media",
        )
        permitidas = {"mensajes", "cursor", "solo_lectura"}
        permitidas |= {"id", "autor", "nombre", "texto", "creado_en"}
        for contenido in respuestas:
            for prohibido in prohibidos:
                self.assertNotIn(prohibido, contenido)
            self.assertLessEqual(claves(json.loads(contenido)), permitidas)
        autor = json.loads(respuestas[2])["mensajes"][0]["autor"]
        self.assertEqual(set(autor), {"id", "nombre"})

    def test_logs_sin_texto_ni_nombre(self):
        with self.assertLogs("apps.mensajes", level="INFO") as registro:
            with self.captureOnCommitCallbacks(execute=True):
                mensaje = self.enviar(SECRETO, como=self.comprador).json()
        salida = "\n".join(registro.output)
        self.assertIn(f"pedido_id={self.pedido.pk}", salida)
        self.assertIn(f"mensaje_id={mensaje['id']}", salida)
        self.assertIn(f"actor_id={self.comprador.pk}", salida)
        for prohibido in (SECRETO, self.comprador.nombre, self.comprador.telefono):
            self.assertNotIn(prohibido, salida)


class PrivacidadAdministrativaTests(MensajesAPITestCase):
    def setUp(self):
        super().setUp()
        self.enviar(SECRETO, como=self.comprador)
        self.superusuario = Usuario.objects.create_superuser(
            telefono="89990000", password=PASSWORD, nombre="Mantenimiento"
        )
        self.navegador = Client()
        self.navegador.force_login(self.superusuario)

    def test_ningun_modelo_de_mensajes_en_admin(self):
        for modelo in apps.get_app_config("mensajes").get_models():
            self.assertNotIn(modelo, admin.site._registry, modelo)

    def test_superusuario_no_lee_el_chat_en_admin(self):
        for ruta in ("/admin/mensajes/", "/admin/mensajes/mensajepedido/"):
            self.assertEqual(self.navegador.get(ruta).status_code, 404, ruta)
        indice = self.navegador.get("/admin/").content.decode()
        self.assertNotIn("/admin/mensajes/", indice)
        detalle = self.navegador.get(f"/admin/pedidos/pedido/{self.pedido.pk}/change/")
        self.assertEqual(detalle.status_code, 200)
        self.assertNotIn(SECRETO, detalle.content.decode())

    def test_sesion_de_admin_no_autentica_la_api(self):
        url = self.url
        self.assertEqual(self.navegador.get(url).status_code, 401)
        self.assertEqual(
            self.navegador.post(url, {"texto": "x"}, content_type="application/json").status_code,
            401,
        )
