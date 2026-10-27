"""Habilitación operativa del artesano (RF-004, RN-002): EsArtesano frente a EsArtesanoAprobado.

Verifica de forma aislada el contrato reutilizable de ``EsArtesano`` y ``EsArtesanoAprobado``
con DRF completo (autenticación Bearer real, permisos y respuestas), complementando las
pruebas de los dominios operativos reales (catálogo, solicitudes, propuestas, inventario,
pedidos, pagos y mensajes).
"""

from rest_framework.response import Response
from rest_framework.test import APIRequestFactory
from rest_framework.views import APIView

from apps.accounts.api.permissions import EsArtesano
from apps.accounts.api.tokens import emitir_tokens
from apps.accounts.models import Rol
from apps.accounts.tests.base import AuthAPITestCase, crear_usuario
from apps.talleres import services
from apps.talleres.api.permissions import MENSAJE_TALLER_NO_APROBADO, EsArtesanoAprobado
from apps.talleres.api.views import MiTallerView
from apps.talleres.models import EstadoTaller

from .base import URL_MI_TALLER, crear_administrador, crear_artesano_con_taller


class VistaOperativa(APIView):
    """Representa una futura función operativa del artesano (publicar, atender pedidos…)."""

    permission_classes = [EsArtesanoAprobado]

    def get(self, request):
        # Reutiliza el taller que el permiso ya cargó.
        return Response({"taller": request.user.taller.pk})

    post = get


class HabilitacionTestCase(AuthAPITestCase):
    def setUp(self):
        super().setUp()
        self.factory = APIRequestFactory()
        self.admin = crear_administrador()
        self.pendiente = crear_artesano_con_taller("82222222", nombre="Pendiente")
        self.rechazado = crear_artesano_con_taller("83333333", nombre="Rechazado")
        services.rechazar_taller(self.rechazado, revisor=self.admin, motivo="Dirección falsa")
        self.aprobado = crear_artesano_con_taller("84444444", nombre="Aprobado")
        services.aprobar_taller(self.aprobado, revisor=self.admin)

    def operar(self, access=None, metodo="get"):
        extra = {} if access is None else {"HTTP_AUTHORIZATION": f"Bearer {access}"}
        peticion = getattr(self.factory, metodo)("/operativa/", format="json", **extra)
        return VistaOperativa.as_view()(peticion)

    def token_de(self, usuario) -> str:
        return emitir_tokens(usuario)[0]


class ArtesanoPendienteTests(HabilitacionTestCase):
    """A. Gestiona su solicitud, pero no opera."""

    def test_se_autentica_y_gestiona_su_taller(self):
        access = self.iniciar_sesion("82222222")
        self.con_token(access)
        respuesta = self.client.get(URL_MI_TALLER)
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.json()["estado"], EstadoTaller.PENDIENTE)
        respuesta = self.client.patch(URL_MI_TALLER, {"horario": "L-S 8 a 5"}, format="json")
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(respuesta.json()["estado"], EstadoTaller.PENDIENTE)

    def test_no_pasa_la_habilitacion_operativa(self):
        access = self.iniciar_sesion("82222222")
        for metodo in ("get", "post"):
            with self.subTest(metodo=metodo):
                respuesta = self.operar(access, metodo)
                self.assertEqual(respuesta.status_code, 403)
                self.assertEqual(respuesta.data, {"detail": MENSAJE_TALLER_NO_APROBADO})


class ArtesanoRechazadoTests(HabilitacionTestCase):
    """B. Consulta su taller y el motivo, pero no opera."""

    def test_se_autentica_y_consulta_el_motivo(self):
        self.con_token(self.iniciar_sesion("83333333"))
        respuesta = self.client.get(URL_MI_TALLER)
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.json()["estado"], EstadoTaller.RECHAZADO)
        self.assertEqual(respuesta.json()["motivo_rechazo"], "Dirección falsa")

    def test_no_pasa_la_habilitacion_operativa(self):
        respuesta = self.operar(self.iniciar_sesion("83333333"))
        self.assertEqual(respuesta.status_code, 403)
        self.assertEqual(respuesta.data, {"detail": MENSAJE_TALLER_NO_APROBADO})

    def test_editar_el_perfil_no_lo_reactiva(self):
        self.con_token(self.iniciar_sesion("83333333"))
        self.client.patch(URL_MI_TALLER, {"direccion_completa": "Otra, Masaya"}, format="json")
        self.rechazado.refresh_from_db()
        self.assertEqual(self.rechazado.estado, EstadoTaller.RECHAZADO)
        self.assertEqual(self.operar(self.token_de(self.rechazado.propietario)).status_code, 403)


class ArtesanoAprobadoTests(HabilitacionTestCase):
    """C. Opera."""

    def test_pasa_la_habilitacion_operativa(self):
        respuesta = self.operar(self.iniciar_sesion("84444444"))
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data, {"taller": self.aprobado.pk})

    def test_la_aprobacion_surte_efecto_en_la_siguiente_peticion(self):
        """La habilitación se decide en cada petición, no al emitir el token."""
        access = self.iniciar_sesion("82222222")
        self.assertEqual(self.operar(access).status_code, 403)
        services.aprobar_taller(self.pendiente, revisor=self.admin)
        self.assertEqual(self.operar(access).status_code, 200)

    def test_un_taller_aprobado_no_habilita_otra_cuenta(self):
        """El permiso solo mira el taller propio: el aprobado de otro no cuenta."""
        respuesta = self.operar(self.token_de(self.pendiente.propietario))
        self.assertEqual(respuesta.status_code, 403)
        self.assertNotIn("Aprobado", str(respuesta.data))

    def test_el_permiso_carga_el_taller_con_una_sola_consulta(self):
        access = self.token_de(self.aprobado.propietario)
        # Usuario autenticado (1) y su taller (1); la vista reutiliza el taller en caché.
        with self.assertNumQueries(2):
            self.assertEqual(self.operar(access).status_code, 200)


class SinHabilitacionTests(HabilitacionTestCase):
    def test_comprador(self):
        """D."""
        comprador = crear_usuario("81111111", rol=Rol.COMPRADOR)
        respuesta = self.operar(self.token_de(comprador))
        self.assertEqual(respuesta.status_code, 403)
        self.assertEqual(respuesta.data, {"detail": EsArtesano.message})

    def test_anonimo(self):
        """E."""
        self.assertEqual(self.operar().status_code, 401)
        self.assertEqual(self.operar(metodo="post").status_code, 401)

    def test_token_no_valido(self):
        self.assertEqual(self.operar("no-es-un-token").status_code, 401)

    def test_artesano_sin_taller(self):
        """F. Cuenta anterior a AUD-02: respuesta controlada, sin 500."""
        sin_taller = crear_usuario("85555555", rol=Rol.ARTESANO)
        respuesta = self.operar(self.token_de(sin_taller))
        self.assertEqual(respuesta.status_code, 403)
        self.assertEqual(respuesta.data, {"detail": MENSAJE_TALLER_NO_APROBADO})


class GestionDeLaSolicitudTests(HabilitacionTestCase):
    def test_mi_taller_no_exige_la_aprobacion(self):
        """El artesano no aprobado gestiona su solicitud: mi-taller usa EsArtesano."""
        self.assertNotIn(EsArtesanoAprobado, MiTallerView.permission_classes)
        self.assertIn(EsArtesano, MiTallerView.permission_classes)
