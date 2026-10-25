"""RF-016: preferencia de entrega opcional del comprador y su huella idempotente."""

from uuid import uuid4

from django.db import IntegrityError, transaction

from apps.operaciones.models import OperacionIdempotente
from apps.operaciones.services import calcular_huella
from apps.solicitudes.models import Solicitud

from .base import SolicitudesAPITestCase, datos_renglon


class EntregaPreferidaTests(SolicitudesAPITestCase):
    def enviar_con(self, *, clave=None, **entrega):
        return self.publicar({"renglones": [datos_renglon(self.producto)], **entrega}, clave=clave)

    def test_sin_preferencia_no_se_inventa_una(self):
        respuesta = self.enviar_con()
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.assertEqual(
            (
                respuesta.data["modalidad_entrega_preferida"],
                respuesta.data["descripcion_entrega_preferida"],
            ),
            ("", ""),
        )

    def test_conserva_cada_modalidad_y_descripcion_opcional(self):
        for modalidad in ("retiro_taller", "punto_encuentro", "entrega_artesano"):
            with self.subTest(modalidad=modalidad):
                respuesta = self.enviar_con(modalidad_entrega_preferida=modalidad)
                self.assertEqual(respuesta.status_code, 201, respuesta.data)
                solicitud = Solicitud.objects.get(pk=respuesta.data["id"])
                self.assertEqual(solicitud.modalidad_entrega_preferida, modalidad)
        respuesta = self.enviar_con(
            modalidad_entrega_preferida="punto_encuentro",
            descripcion_entrega_preferida="Parque central de Masaya",
        )
        self.assertEqual(
            respuesta.data["descripcion_entrega_preferida"], "Parque central de Masaya"
        )

    def test_otra_conserva_descripcion_y_la_exige(self):
        respuesta = self.enviar_con(
            modalidad_entrega_preferida="otra", descripcion_entrega_preferida="Encomienda a Granada"
        )
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.assertEqual(respuesta.data["descripcion_entrega_preferida"], "Encomienda a Granada")
        for descripcion in (None, "", "   "):
            with self.subTest(descripcion=descripcion):
                datos = {"modalidad_entrega_preferida": "otra"}
                if descripcion is not None:
                    datos["descripcion_entrega_preferida"] = descripcion
                self.assertEqual(self.enviar_con(**datos).status_code, 400)

    def test_descripcion_sin_modalidad_o_modalidad_invalida_falla(self):
        casos = (
            {"descripcion_entrega_preferida": "Algo"},
            {"modalidad_entrega_preferida": "envio_express"},
            {"modalidad_entrega_preferida": ""},
        )
        antes = Solicitud.objects.count()
        for datos in casos:
            with self.subTest(datos=datos):
                self.assertEqual(self.enviar_con(**datos).status_code, 400)
        self.assertEqual(Solicitud.objects.count(), antes)

    def test_misma_clave_con_otra_preferencia_es_409(self):
        clave = str(uuid4())
        primera = self.enviar_con(clave=clave, modalidad_entrega_preferida="retiro_taller")
        self.assertEqual(primera.status_code, 201)
        for otra in (
            {"modalidad_entrega_preferida": "entrega_artesano"},
            {},
            {"modalidad_entrega_preferida": "retiro_taller", "descripcion_entrega_preferida": "x"},
        ):
            with self.subTest(otra=otra):
                respuesta = self.enviar_con(clave=clave, **otra)
                self.assertEqual(respuesta.status_code, 409)
                self.assertEqual(respuesta.data["codigo"], "clave_idempotencia_reutilizada")
        self.assertEqual(Solicitud.objects.count(), 1)

    def test_replay_exacto_con_preferencia_devuelve_la_misma_solicitud(self):
        clave = str(uuid4())
        datos = {
            "modalidad_entrega_preferida": "otra",
            "descripcion_entrega_preferida": "Bus a León",
        }
        primera = self.enviar_con(clave=clave, **datos)
        segunda = self.enviar_con(clave=clave, **datos)
        self.assertEqual((primera.status_code, segunda.status_code), (201, 201))
        self.assertEqual(primera.data["id"], segunda.data["id"])
        self.assertEqual(segunda["Idempotency-Replayed"], "true")

    def test_huella_sin_preferencia_es_compatible_con_la_anterior_a_aud06(self):
        # Una clave registrada antes de AUD-06 (huella solo de renglones) sigue repitiéndose.
        clave = str(uuid4())
        respuesta = self.enviar_con(clave=clave)
        renglones = [{"producto": self.producto.pk, "modalidad": "stock", "cantidad": 1}]
        self.assertEqual(
            OperacionIdempotente.objects.get().huella, calcular_huella({"renglones": renglones})
        )
        self.assertEqual(self.enviar_con(clave=clave).data["id"], respuesta.data["id"])

    def test_constraint_de_entrega_preferida(self):
        solicitud = self.crear()
        for modalidad, descripcion in (("otra", ""), ("otra", "  "), ("", "texto"), ("avion", "")):
            with (
                self.subTest(modalidad=modalidad),
                self.assertRaises(IntegrityError),
                transaction.atomic(),
            ):
                Solicitud.objects.filter(pk=solicitud.pk).update(
                    modalidad_entrega_preferida=modalidad, descripcion_entrega_preferida=descripcion
                )
