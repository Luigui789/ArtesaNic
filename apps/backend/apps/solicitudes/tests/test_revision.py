"""AUD-06: resolución individual de renglones, historial, DR-03 e idempotencia."""

from uuid import uuid4

from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.test.utils import CaptureQueriesContext

from apps.accounts.models import Rol
from apps.accounts.tests.base import crear_usuario
from apps.operaciones.models import OperacionIdempotente, TipoOperacion
from apps.solicitudes import services
from apps.solicitudes.models import (
    EstadoSolicitud,
    RenglonSolicitud,
    ResolucionRenglon,
    RevisionRenglonSolicitud,
)

from .base import SolicitudesAPITestCase, datos_renglon, url_recibida


def url_resolver(solicitud_id, renglon_id):
    return f"{url_recibida(solicitud_id)}renglones/{renglon_id}/resolver/"


ACEPTAR = {"resolucion": "aceptado"}


def rechazar(motivo="Sin materia prima este mes"):
    return {"resolucion": "rechazado", "motivo_rechazo": motivo}


class RevisionAPITestCase(SolicitudesAPITestCase):
    def setUp(self):
        super().setUp()
        self.solicitud = self.crear(
            datos_renglon(self.producto, cantidad=3),
            datos_renglon(
                self.producto, modalidad="produccion", cantidad=7, fecha_solicitada=self.fecha
            ),
            datos_renglon(
                self.producto,
                modalidad="personalizacion",
                caracteristicas="Iniciales AM",
                origen_personalizacion="desde_cero",
            ),
        )
        self.r1, self.r2, self.r3 = self.solicitud.renglones.order_by("posicion")
        self.autenticar(self.artesano)

    def resolver(self, renglon, datos, *, clave=None, solicitud=None):
        solicitud_id = (solicitud or self.solicitud).pk
        return self.client.post(
            url_resolver(solicitud_id, renglon.pk),
            datos,
            format="json",
            HTTP_IDEMPOTENCY_KEY=clave or str(uuid4()),
        )

    def estado(self):
        self.solicitud.refresh_from_db()
        return self.solicitud.estado


class ResolucionTests(RevisionAPITestCase):
    def test_aceptar_renglon_pendiente(self):
        respuesta = self.resolver(self.r1, ACEPTAR)
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        self.assertNotIn("Idempotency-Replayed", respuesta)
        renglon = respuesta.data["renglones"][0]
        self.assertEqual((renglon["resolucion"], renglon["motivo_rechazo"]), ("aceptado", ""))
        self.assertIsNotNone(renglon["resuelto_en"])
        self.assertEqual(
            renglon["resuelto_por"], {"id": self.artesano.pk, "nombre": self.artesano.nombre}
        )
        self.r1.refresh_from_db()
        self.assertEqual(self.r1.resolucion, ResolucionRenglon.ACEPTADO)

    def test_rechazar_con_motivo_normalizado(self):
        respuesta = self.resolver(self.r2, rechazar("  No llegamos a la fecha  "))
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        self.r2.refresh_from_db()
        self.assertEqual(self.r2.resolucion, ResolucionRenglon.RECHAZADO)
        self.assertEqual(self.r2.motivo_rechazo, "No llegamos a la fecha")

    def test_rechazo_sin_motivo_o_solo_espacios_falla_sin_efectos(self):
        for datos in ({"resolucion": "rechazado"}, rechazar(""), rechazar("   \n\t ")):
            with self.subTest(datos=datos):
                respuesta = self.resolver(self.r1, datos)
                self.assertEqual(respuesta.status_code, 400)
                self.assertIn("motivo_rechazo", respuesta.data)
        self.assertFalse(RevisionRenglonSolicitud.objects.exists())
        self.assertFalse(OperacionIdempotente.objects.exists())

    def test_aceptar_con_motivo_falla(self):
        for motivo in ("Motivo", ""):
            with self.subTest(motivo=motivo):
                respuesta = self.resolver(self.r1, ACEPTAR | {"motivo_rechazo": motivo})
                self.assertEqual(respuesta.status_code, 400)
        self.r1.refresh_from_db()
        self.assertEqual(self.r1.resolucion, ResolucionRenglon.PENDIENTE)

    def test_resolucion_invalida_o_pendiente_falla(self):
        for valor in ("pendiente", "aceptar", "", None, True):
            with self.subTest(valor=valor):
                self.assertEqual(self.resolver(self.r1, {"resolucion": valor}).status_code, 400)

    def test_resolucion_conserva_producto_modalidad_cantidad_fecha_y_caracteristicas(self):
        antes = [
            RenglonSolicitud.objects.values(
                "producto",
                "modalidad",
                "cantidad",
                "fecha_solicitada",
                "caracteristicas",
                "origen_personalizacion",
                "posicion",
            ).get(pk=r.pk)
            for r in (self.r1, self.r2, self.r3)
        ]
        self.resolver(self.r1, ACEPTAR)
        self.resolver(self.r2, rechazar())
        self.resolver(self.r3, ACEPTAR)
        despues = [
            RenglonSolicitud.objects.values(*antes[0]).get(pk=r.pk)
            for r in (self.r1, self.r2, self.r3)
        ]
        self.assertEqual(antes, despues)

    def test_no_existe_contraoferta_ni_campos_privilegiados(self):
        for campo, valor in (
            ("cantidad", 1),
            ("cantidad_aceptada", 1),
            ("nueva_cantidad", 2),
            ("producto", self.otro_producto.pk),
            ("modalidad", "stock"),
            ("precio_negociado", "10.00"),
            ("precio_unitario", "1.00"),
            ("estado", "lista_propuesta"),
            ("resuelto_por", self.artesano_ajeno.pk),
            ("taller", self.taller_ajeno.pk),
            ("comprador", self.otro_comprador.pk),
        ):
            with self.subTest(campo=campo):
                respuesta = self.resolver(self.r1, ACEPTAR | {campo: valor})
                self.assertEqual(respuesta.status_code, 400)
                self.assertIn(campo, respuesta.data)
        self.r1.refresh_from_db()
        self.assertEqual((self.r1.resolucion, self.r1.cantidad), (ResolucionRenglon.PENDIENTE, 3))

    def test_resolucion_final_no_se_invierte_ni_se_repite_con_otra_clave(self):
        self.assertEqual(self.resolver(self.r1, ACEPTAR).status_code, 200)
        self.assertEqual(self.resolver(self.r2, rechazar("Primero")).status_code, 200)
        for renglon, datos in (
            (self.r1, rechazar()),
            (self.r1, ACEPTAR),
            (self.r2, ACEPTAR),
            (self.r2, rechazar("Otro motivo")),
        ):
            with self.subTest(renglon=renglon.posicion, datos=datos):
                respuesta = self.resolver(renglon, datos)
                self.assertEqual(respuesta.status_code, 409)
                self.assertEqual(respuesta.data["codigo"], "renglon_ya_resuelto")
        self.r1.refresh_from_db()
        self.r2.refresh_from_db()
        self.assertEqual(self.r1.resolucion, ResolucionRenglon.ACEPTADO)
        self.assertEqual(self.r2.motivo_rechazo, "Primero")
        self.assertEqual(RevisionRenglonSolicitud.objects.count(), 2)
        # Un conflicto de negocio no deja registro idempotente.
        self.assertEqual(OperacionIdempotente.objects.count(), 2)

    def test_metodos_no_soportados_responden_405(self):
        ruta = url_resolver(self.solicitud.pk, self.r1.pk)
        for metodo in ("get", "put", "patch", "delete"):
            with self.subTest(metodo=metodo):
                self.assertEqual(getattr(self.client, metodo)(ruta).status_code, 405)

    def test_exige_idempotency_key(self):
        ruta = url_resolver(self.solicitud.pk, self.r1.pk)
        self.assertEqual(self.client.post(ruta, ACEPTAR, format="json").status_code, 400)
        respuesta = self.client.post(ruta, ACEPTAR, format="json", HTTP_IDEMPOTENCY_KEY="corta")
        self.assertIn("Idempotency-Key", respuesta.data)
        self.assertFalse(RevisionRenglonSolicitud.objects.exists())


class PermisosResolucionTests(RevisionAPITestCase):
    def test_anonimo_recibe_401(self):
        self.anonimo()
        self.assertEqual(self.resolver(self.r1, ACEPTAR).status_code, 401)

    def test_comprador_recibe_403(self):
        self.autenticar(self.comprador)
        self.assertEqual(self.resolver(self.r1, ACEPTAR).status_code, 403)

    def test_administrador_no_tiene_bypass_comercial(self):
        # Política vigente: la administración no usa la API comercial (puede_usar_api).
        self.autenticar(self.admin)
        self.assertEqual(self.resolver(self.r1, ACEPTAR).status_code, 401)
        self.assertFalse(RevisionRenglonSolicitud.objects.exists())

    def test_artesano_pendiente_o_rechazado_recibe_403(self):
        for taller in (self.taller_pendiente, self.taller_rechazado):
            with self.subTest(estado=taller.estado):
                self.autenticar(taller.propietario)
                self.assertEqual(self.resolver(self.r1, ACEPTAR).status_code, 403)

    def test_artesano_sin_taller_recibe_403(self):
        self.autenticar(crear_usuario("81111111", rol=Rol.ARTESANO))
        self.assertEqual(self.resolver(self.r1, ACEPTAR).status_code, 403)

    def test_otro_artesano_recibe_404(self):
        self.autenticar(self.artesano_ajeno)
        self.assertEqual(self.resolver(self.r1, ACEPTAR).status_code, 404)
        self.assertFalse(RevisionRenglonSolicitud.objects.exists())

    def test_renglon_de_otra_solicitud_o_inexistente_404(self):
        otra = self.crear(datos_renglon(self.producto))
        renglon_otra = otra.renglones.get()
        self.assertEqual(self.resolver(renglon_otra, ACEPTAR).status_code, 404)
        self.assertEqual(
            self.client.post(
                url_resolver(self.solicitud.pk, 999999),
                ACEPTAR,
                format="json",
                HTTP_IDEMPOTENCY_KEY=str(uuid4()),
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.post(
                url_resolver(999999, self.r1.pk),
                ACEPTAR,
                format="json",
                HTTP_IDEMPOTENCY_KEY=str(uuid4()),
            ).status_code,
            404,
        )
        self.assertFalse(RevisionRenglonSolicitud.objects.exists())

    def test_servicio_rechaza_actor_no_habilitado_aunque_se_omita_la_vista(self):
        for actor in (self.comprador, self.taller_pendiente.propietario):
            with self.subTest(actor=actor.rol), self.assertRaises(services.ArtesanoNoHabilitado):
                services.resolver_renglon(
                    artesano=actor,
                    solicitud_id=self.solicitud.pk,
                    renglon_id=self.r1.pk,
                    resolucion="aceptado",
                )
        with self.assertRaises(services.SolicitudNoEncontrada):
            services.resolver_renglon(
                artesano=self.artesano_ajeno,
                solicitud_id=self.solicitud.pk,
                renglon_id=self.r1.pk,
                resolucion="aceptado",
            )


class HistorialTests(RevisionAPITestCase):
    def test_guarda_resolucion_actor_fecha_y_motivo(self):
        self.resolver(self.r1, ACEPTAR)
        self.resolver(self.r2, rechazar("Horno en reparación"))
        aceptada = RevisionRenglonSolicitud.objects.get(renglon=self.r1)
        rechazada = RevisionRenglonSolicitud.objects.get(renglon=self.r2)
        self.assertEqual(
            (aceptada.resolucion, aceptada.motivo_rechazo, aceptada.resuelto_por),
            (ResolucionRenglon.ACEPTADO, "", self.artesano),
        )
        self.assertEqual(
            (rechazada.resolucion, rechazada.motivo_rechazo, rechazada.resuelto_por),
            (ResolucionRenglon.RECHAZADO, "Horno en reparación", self.artesano),
        )
        self.assertLessEqual(aceptada.resuelto_en, rechazada.resuelto_en)

    def test_comprador_ve_resolucion_motivo_y_fecha_sin_revisor(self):
        self.resolver(self.r2, rechazar("Horno en reparación"))
        self.autenticar(self.comprador)
        renglon = self.client.get(f"/api/v1/solicitudes/mias/{self.solicitud.pk}/").data[
            "renglones"
        ][1]
        self.assertEqual(
            (renglon["resolucion"], renglon["motivo_rechazo"]), ("rechazado", "Horno en reparación")
        )
        self.assertIsNotNone(renglon["resuelto_en"])
        self.assertNotIn("resuelto_por", renglon)

    def test_historial_no_se_edita_ni_se_elimina(self):
        self.resolver(self.r1, ACEPTAR)
        revision = RevisionRenglonSolicitud.objects.get()
        revision.resolucion = ResolucionRenglon.RECHAZADO
        with self.assertRaises(ValidationError):
            revision.save()
        with self.assertRaises(ValidationError):
            revision.delete()
        self.assertEqual(
            RevisionRenglonSolicitud.objects.get().resolucion, ResolucionRenglon.ACEPTADO
        )

    def test_una_sola_revision_por_renglon_en_base_de_datos(self):
        self.resolver(self.r1, ACEPTAR)
        with self.assertRaises(IntegrityError), transaction.atomic():
            RevisionRenglonSolicitud.objects.create(
                renglon=self.r1,
                resolucion="rechazado",
                motivo_rechazo="x",
                resuelto_por=self.artesano,
            )

    def test_constraints_de_la_revision(self):
        casos = (
            {"resolucion": "pendiente", "motivo_rechazo": ""},
            {"resolucion": "rechazado", "motivo_rechazo": "  "},
            {"resolucion": "aceptado", "motivo_rechazo": "no corresponde"},
        )
        for datos in casos:
            with self.subTest(datos=datos), self.assertRaises(IntegrityError), transaction.atomic():
                RevisionRenglonSolicitud.objects.create(
                    renglon=self.r3, resuelto_por=self.artesano, **datos
                )


class EstadosDR03Tests(RevisionAPITestCase):
    def test_resolucion_parcial_mantiene_pendiente_revision(self):
        self.resolver(self.r1, ACEPTAR)
        self.resolver(self.r2, rechazar())
        self.assertEqual(self.estado(), EstadoSolicitud.PENDIENTE_REVISION)

    def test_ultimo_renglon_con_algun_aceptado_lista_propuesta(self):
        self.resolver(self.r1, rechazar())
        self.resolver(self.r2, rechazar())
        respuesta = self.resolver(self.r3, ACEPTAR)
        self.assertEqual(respuesta.data["estado"], "lista_propuesta")
        self.assertEqual(self.estado(), EstadoSolicitud.LISTA_PROPUESTA)

    def test_todos_rechazados_rechazada_conserva_todo_y_sin_propuesta(self):
        from apps.propuestas.models import Propuesta

        for i, renglon in enumerate((self.r1, self.r2, self.r3), start=1):
            self.resolver(renglon, rechazar(f"Motivo {i}"))
        self.assertEqual(self.estado(), EstadoSolicitud.RECHAZADA)
        self.assertEqual(
            list(
                self.solicitud.renglones.order_by("posicion").values_list(
                    "resolucion", "motivo_rechazo"
                )
            ),
            [("rechazado", "Motivo 1"), ("rechazado", "Motivo 2"), ("rechazado", "Motivo 3")],
        )
        self.assertEqual(
            RevisionRenglonSolicitud.objects.filter(renglon__solicitud=self.solicitud).count(), 3
        )
        self.assertFalse(Propuesta.objects.exists())
        self.assertNotIn("propuesta", self.client.get(url_recibida(self.solicitud.pk)).data)

    def test_estado_tras_revision_es_deterministico(self):
        P, A, R = "pendiente", "aceptado", "rechazado"
        casos = {
            (P,): "pendiente_revision",
            (A, P): "pendiente_revision",
            (R, P): "pendiente_revision",
            (A,): "lista_propuesta",
            (A, R): "lista_propuesta",
            (R, R): "rechazada",
        }
        for resoluciones, esperado in casos.items():
            with self.subTest(resoluciones=resoluciones):
                self.assertEqual(services.estado_tras_revision(list(resoluciones)), esperado)


class IdempotenciaResolucionTests(RevisionAPITestCase):
    def test_misma_clave_y_entrada_repite_sin_duplicar_historial(self):
        clave = str(uuid4())
        primera = self.resolver(self.r2, rechazar(), clave=clave)
        segunda = self.resolver(self.r2, rechazar("  Sin materia prima este mes "), clave=clave)
        self.assertEqual((primera.status_code, segunda.status_code), (200, 200))
        self.assertEqual(segunda["Idempotency-Replayed"], "true")
        self.assertEqual(segunda.data["id"], self.solicitud.pk)
        self.assertEqual(RevisionRenglonSolicitud.objects.count(), 1)
        operacion = OperacionIdempotente.objects.get()
        self.assertEqual(operacion.tipo, TipoOperacion.RESOLVER_RENGLON)
        self.assertEqual(operacion.recurso_tipo, "solicitudes.revisionrenglonsolicitud")

    def test_misma_clave_contra_otro_renglon_es_409_de_idempotencia(self):
        clave = str(uuid4())
        self.resolver(self.r1, ACEPTAR, clave=clave)
        respuesta = self.resolver(self.r2, ACEPTAR, clave=clave)
        self.assertEqual(respuesta.status_code, 409)
        self.assertEqual(respuesta.data["codigo"], "clave_idempotencia_reutilizada")
        self.r2.refresh_from_db()
        self.assertEqual(self.r2.resolucion, ResolucionRenglon.PENDIENTE)

    def test_misma_clave_con_otra_resolucion_o_motivo_es_409_de_idempotencia(self):
        clave = str(uuid4())
        self.resolver(self.r1, ACEPTAR, clave=clave)
        for datos in (rechazar(), rechazar("Otro")):
            with self.subTest(datos=datos):
                respuesta = self.resolver(self.r1, datos, clave=clave)
                self.assertEqual(respuesta.data["codigo"], "clave_idempotencia_reutilizada")

    def test_misma_clave_en_otra_solicitud_es_409(self):
        clave = str(uuid4())
        otra = self.crear(datos_renglon(self.producto))
        self.resolver(self.r1, ACEPTAR, clave=clave)
        respuesta = self.resolver(otra.renglones.get(), ACEPTAR, clave=clave, solicitud=otra)
        self.assertEqual(respuesta.data["codigo"], "clave_idempotencia_reutilizada")

    def test_claves_distintas_contra_renglon_resuelto_es_conflicto_de_negocio(self):
        self.resolver(self.r1, ACEPTAR)
        respuesta = self.resolver(self.r1, ACEPTAR)
        self.assertEqual(respuesta.status_code, 409)
        self.assertEqual(respuesta.data["codigo"], "renglon_ya_resuelto")

    def test_replay_tras_rechazo_total_sigue_devolviendo_la_solicitud(self):
        clave = str(uuid4())
        self.resolver(self.r1, rechazar())
        self.resolver(self.r2, rechazar())
        self.resolver(self.r3, rechazar(), clave=clave)
        respuesta = self.resolver(self.r3, rechazar(), clave=clave)
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data["estado"], "rechazada")


class ConsultasRevisionTests(RevisionAPITestCase):
    def test_lectura_con_historial_no_agrega_consultas_por_renglon(self):
        ruta = url_recibida(self.solicitud.pk)
        with CaptureQueriesContext(connection) as antes:
            self.assertEqual(self.client.get(ruta).status_code, 200)
        for renglon in (self.r1, self.r2, self.r3):
            self.resolver(renglon, ACEPTAR)
        with CaptureQueriesContext(connection) as despues:
            self.assertEqual(self.client.get(ruta).status_code, 200)
        self.assertEqual(len(antes), len(despues))
