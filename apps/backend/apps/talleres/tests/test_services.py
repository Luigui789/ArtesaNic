"""Servicios del taller: alta pendiente, perfil y aprobación (RF-008, RF-013, RN-002)."""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.accounts.models import Rol
from apps.accounts.tests.base import crear_usuario
from apps.talleres import services
from apps.talleres.models import EstadoTaller, Taller

from .base import crear_administrador, crear_artesano_con_taller, datos_taller


class CrearTallerPendienteTests(TestCase):
    def test_crea_el_taller_pendiente_sin_revision(self):
        artesano = crear_usuario("82222222", rol=Rol.ARTESANO)
        taller = services.crear_taller_pendiente(propietario=artesano, **datos_taller())
        self.assertEqual(taller.propietario, artesano)
        self.assertEqual(taller.estado, EstadoTaller.PENDIENTE)
        self.assertIsNone(taller.revisado_por)
        self.assertIsNone(taller.revisado_en)
        self.assertEqual(taller.motivo_rechazo, "")

    def test_no_copia_el_telefono_de_acceso_como_contacto(self):
        taller = crear_artesano_con_taller("82222222")
        self.assertEqual(taller.telefono_publico, "")
        self.assertEqual(taller.whatsapp_publico, "")

    def test_solo_un_artesano_puede_ser_propietario(self):
        for rol in (Rol.COMPRADOR, Rol.ADMINISTRADOR):
            with self.subTest(rol=rol):
                cuenta = crear_usuario(f"8{len(rol):07d}", rol=rol)
                with self.assertRaises(services.PropietarioNoValido):
                    services.crear_taller_pendiente(propietario=cuenta, **datos_taller())
        self.assertFalse(Taller.objects.exists())

    def test_un_artesano_no_tiene_dos_talleres(self):
        taller = crear_artesano_con_taller()
        with self.assertRaises(ValidationError):
            services.crear_taller_pendiente(propietario=taller.propietario, **datos_taller())
        self.assertEqual(Taller.objects.count(), 1)

    def test_valida_los_datos_del_modelo(self):
        artesano = crear_usuario("82222222", rol=Rol.ARTESANO)
        with self.assertRaises(ValidationError) as contexto:
            services.crear_taller_pendiente(
                propietario=artesano, **datos_taller(rubro="", sitio_web="javascript:alert(1)")
            )
        self.assertEqual(set(contexto.exception.message_dict), {"rubro", "sitio_web"})
        self.assertFalse(Taller.objects.exists())


class RevisionTests(TestCase):
    def setUp(self):
        self.taller = crear_artesano_con_taller()
        self.admin = crear_administrador()

    def test_pendiente_a_aprobado(self):
        self.assertTrue(services.aprobar_taller(self.taller, revisor=self.admin))
        self.taller.refresh_from_db()
        self.assertEqual(self.taller.estado, EstadoTaller.APROBADO)
        self.assertEqual(self.taller.revisado_por, self.admin)
        self.assertIsNotNone(self.taller.revisado_en)
        self.assertTrue(self.taller.es_publico)

    def test_pendiente_a_rechazado_con_motivo_opcional(self):
        self.assertTrue(
            services.rechazar_taller(self.taller, revisor=self.admin, motivo="  Sin dirección  ")
        )
        self.taller.refresh_from_db()
        self.assertEqual(self.taller.estado, EstadoTaller.RECHAZADO)
        self.assertEqual(self.taller.revisado_por, self.admin)
        self.assertIsNotNone(self.taller.revisado_en)
        self.assertEqual(self.taller.motivo_rechazo, "Sin dirección")
        self.assertFalse(self.taller.es_publico)

    def test_rechazo_sin_motivo(self):
        self.assertTrue(services.rechazar_taller(self.taller, revisor=self.admin))
        self.taller.refresh_from_db()
        self.assertEqual(self.taller.estado, EstadoTaller.RECHAZADO)
        self.assertEqual(self.taller.motivo_rechazo, "")

    def test_aprobar_dos_veces_no_tiene_efectos(self):
        services.aprobar_taller(self.taller, revisor=self.admin)
        self.taller.refresh_from_db()
        revisado_en = self.taller.revisado_en
        otro_admin = crear_administrador("88886666")
        self.assertFalse(services.aprobar_taller(self.taller, revisor=otro_admin))
        self.taller.refresh_from_db()
        self.assertEqual(self.taller.revisado_en, revisado_en)
        self.assertEqual(self.taller.revisado_por, self.admin)

    def test_rechazar_dos_veces_no_tiene_efectos(self):
        services.rechazar_taller(self.taller, revisor=self.admin, motivo="Primero")
        self.taller.refresh_from_db()
        revisado_en = self.taller.revisado_en
        self.assertFalse(
            services.rechazar_taller(self.taller, revisor=self.admin, motivo="Segundo")
        )
        self.taller.refresh_from_db()
        self.assertEqual(self.taller.revisado_en, revisado_en)
        self.assertEqual(self.taller.motivo_rechazo, "Primero")

    def test_transiciones_no_permitidas(self):
        rechazado = crear_artesano_con_taller("83333333")
        services.rechazar_taller(rechazado, revisor=self.admin)
        services.aprobar_taller(self.taller, revisor=self.admin)

        with self.assertRaises(services.TransicionNoPermitida):
            services.aprobar_taller(rechazado, revisor=self.admin)
        with self.assertRaises(services.TransicionNoPermitida):
            services.rechazar_taller(self.taller, revisor=self.admin)

        rechazado.refresh_from_db()
        self.taller.refresh_from_db()
        self.assertEqual(rechazado.estado, EstadoTaller.RECHAZADO)
        self.assertEqual(self.taller.estado, EstadoTaller.APROBADO)

    def test_no_hay_transicion_a_suspendido(self):
        for nombre in ("suspender_taller", "reactivar_taller", "reabrir_taller"):
            self.assertFalse(hasattr(services, nombre))

    def test_solo_la_administracion_activa_revisa(self):
        comprador = crear_usuario("81111111", rol=Rol.COMPRADOR)
        inactivo = crear_administrador("88885555", is_active=False)
        for revisor in (comprador, self.taller.propietario, inactivo):
            with self.subTest(revisor=revisor):
                with self.assertRaises(services.RevisorNoValido):
                    services.aprobar_taller(self.taller, revisor=revisor)
                with self.assertRaises(services.RevisorNoValido):
                    services.rechazar_taller(self.taller, revisor=revisor)
        self.taller.refresh_from_db()
        self.assertEqual(self.taller.estado, EstadoTaller.PENDIENTE)

    def test_motivo_demasiado_largo(self):
        with self.assertRaises(ValidationError):
            services.rechazar_taller(self.taller, revisor=self.admin, motivo="x" * 501)
        self.taller.refresh_from_db()
        self.assertEqual(self.taller.estado, EstadoTaller.PENDIENTE)


class ActualizarPerfilTests(TestCase):
    def setUp(self):
        self.taller = crear_artesano_con_taller()

    def test_actualiza_solo_el_perfil(self):
        taller = services.actualizar_perfil(self.taller, historia="Desde 1985.", horario="L-S")
        self.assertEqual(taller.historia, "Desde 1985.")
        self.assertEqual(taller.horario, "L-S")
        self.assertEqual(taller.estado, EstadoTaller.PENDIENTE)

    def test_rechaza_campos_de_control(self):
        admin = crear_administrador()
        for campo, valor in [
            ("estado", EstadoTaller.APROBADO),
            ("revisado_por", admin),
            ("propietario", admin),
            ("creado_en", None),
        ]:
            with self.subTest(campo=campo):
                with self.assertRaises(ValueError):
                    services.actualizar_perfil(self.taller, **{campo: valor})
        self.taller.refresh_from_db()
        self.assertEqual(self.taller.estado, EstadoTaller.PENDIENTE)

    def test_no_deshace_una_revision_simultanea(self):
        """Una copia desactualizada del taller no reescribe el estado aprobado entre tanto."""
        desactualizado = Taller.objects.get(pk=self.taller.pk)
        services.aprobar_taller(self.taller, revisor=crear_administrador())
        services.actualizar_perfil(desactualizado, nombre="Cerámica López e Hijos")
        self.taller.refresh_from_db()
        self.assertEqual(self.taller.estado, EstadoTaller.APROBADO)
        self.assertEqual(self.taller.nombre, "Cerámica López e Hijos")

    def test_valida_los_datos(self):
        with self.assertRaises(ValidationError):
            services.actualizar_perfil(self.taller, nombre="   ")
        self.taller.refresh_from_db()
        self.assertEqual(self.taller.nombre, "Cerámica López")


class UbicacionServiciosTests(TestCase):
    """Ubicación del taller en el alta y en la edición del perfil (FEAT-GEO-01)."""

    LATITUD = Decimal("11.971234")
    LONGITUD = Decimal("-86.095678")

    def test_crear_sin_ubicacion_conserva_los_valores_por_defecto(self):
        taller = crear_artesano_con_taller()
        taller.refresh_from_db()
        self.assertIsNone(taller.latitud)
        self.assertIsNone(taller.longitud)
        self.assertFalse(taller.ubicacion_publica)

    def test_crear_con_ubicacion(self):
        taller = crear_artesano_con_taller(
            latitud=self.LATITUD, longitud=self.LONGITUD, ubicacion_publica=True
        )
        taller.refresh_from_db()
        self.assertEqual((taller.latitud, taller.longitud), (self.LATITUD, self.LONGITUD))
        self.assertTrue(taller.ubicacion_publica)
        self.assertEqual(taller.estado, EstadoTaller.PENDIENTE)

    def test_crear_con_ubicacion_incoherente(self):
        artesano = crear_usuario("82222222", rol=Rol.ARTESANO)
        with self.assertRaises(ValidationError) as contexto:
            services.crear_taller_pendiente(
                propietario=artesano, **datos_taller(latitud=self.LATITUD)
            )
        self.assertEqual(set(contexto.exception.message_dict), {"longitud"})
        self.assertFalse(Taller.objects.exists())

    def test_actualizar_ubicacion_no_altera_estado_ni_revision(self):
        taller = crear_artesano_con_taller()
        admin = crear_administrador()
        services.aprobar_taller(taller, revisor=admin)
        taller.refresh_from_db()
        revision = (taller.estado, taller.revisado_por_id, taller.revisado_en)

        services.actualizar_perfil(
            taller, latitud=self.LATITUD, longitud=self.LONGITUD, ubicacion_publica=True
        )
        taller.refresh_from_db()
        self.assertEqual((taller.latitud, taller.longitud), (self.LATITUD, self.LONGITUD))
        self.assertTrue(taller.ubicacion_publica)
        self.assertEqual((taller.estado, taller.revisado_por_id, taller.revisado_en), revision)
        self.assertEqual(taller.propietario.rol, Rol.ARTESANO)

    def test_actualizar_ubicacion_de_un_pendiente_no_lo_aprueba(self):
        taller = crear_artesano_con_taller()
        services.actualizar_perfil(taller, latitud=self.LATITUD, longitud=self.LONGITUD)
        taller.refresh_from_db()
        self.assertEqual(taller.estado, EstadoTaller.PENDIENTE)
        self.assertIsNone(taller.revisado_por)
        self.assertIsNone(taller.revisado_en)

    def test_volver_privada_la_ubicacion(self):
        taller = crear_artesano_con_taller(
            latitud=self.LATITUD, longitud=self.LONGITUD, ubicacion_publica=True
        )
        services.actualizar_perfil(taller, ubicacion_publica=False)
        taller.refresh_from_db()
        self.assertFalse(taller.ubicacion_publica)
        self.assertEqual((taller.latitud, taller.longitud), (self.LATITUD, self.LONGITUD))

    def test_eliminar_la_ubicacion(self):
        taller = crear_artesano_con_taller(
            latitud=self.LATITUD, longitud=self.LONGITUD, ubicacion_publica=True
        )
        services.actualizar_perfil(taller, latitud=None, longitud=None, ubicacion_publica=False)
        taller.refresh_from_db()
        self.assertIsNone(taller.latitud)
        self.assertIsNone(taller.longitud)
        self.assertFalse(taller.ubicacion_publica)

    def test_no_elimina_coordenadas_de_una_ubicacion_publica(self):
        taller = crear_artesano_con_taller(
            latitud=self.LATITUD, longitud=self.LONGITUD, ubicacion_publica=True
        )
        with self.assertRaises(ValidationError) as contexto:
            services.actualizar_perfil(taller, latitud=None, longitud=None)
        self.assertEqual(set(contexto.exception.message_dict), {"ubicacion_publica"})
        taller.refresh_from_db()
        self.assertEqual(taller.latitud, self.LATITUD)

    def test_sigue_rechazando_campos_desconocidos(self):
        taller = crear_artesano_con_taller()
        for campo in ("ubicacion_mapa", "coordenadas", "estado"):
            with self.subTest(campo=campo):
                with self.assertRaises(ValueError):
                    services.actualizar_perfil(taller, **{campo: None})
