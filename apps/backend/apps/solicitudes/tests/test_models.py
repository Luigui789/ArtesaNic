from datetime import timedelta

from django.apps import apps
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.utils import timezone

from apps.catalogo import services as catalogo
from apps.solicitudes.models import (
    EstadoSolicitud,
    OrigenPersonalizacion,
    RenglonSolicitud,
    ResolucionRenglon,
    Solicitud,
)

from .base import SolicitudesAPITestCase, datos_renglon


class ModeloTests(SolicitudesAPITestCase):
    def fila(self, **cambios):
        return RenglonSolicitud.objects.create(
            solicitud=self.crear(),
            producto=self.producto,
            posicion=2,
            modalidad="stock",
            cantidad=1,
            **cambios,
        )

    def comprobar_constraint(self, instancia, cambios):
        with self.assertRaises(IntegrityError), transaction.atomic():
            type(instancia).objects.filter(pk=instancia.pk).update(**cambios)

    def test_estado_inicial_y_resolucion_individual(self):
        solicitud = self.crear()
        self.assertEqual(solicitud.estado, "pendiente_revision")
        self.assertFalse(solicitud.es_terminal)
        self.assertEqual(solicitud.renglones.get().resolucion, "pendiente")

    def test_representa_dr03_sin_crear_propuesta_ni_pedido(self):
        solicitud = self.crear(datos_renglon(self.producto), datos_renglon(self.otro_producto))
        solicitud.renglones.update(resolucion="rechazado", motivo_rechazo="No se puede elaborar")
        Solicitud.objects.filter(pk=solicitud.pk).update(estado="rechazada")
        solicitud.refresh_from_db()
        self.assertTrue(solicitud.es_terminal)
        self.assertEqual(solicitud.estado, EstadoSolicitud.RECHAZADA)
        self.assertEqual(solicitud.renglones.count(), 2)
        self.assertTrue(all(r.motivo_rechazo for r in solicitud.renglones.all()))

    def test_solicitud_no_admite_estados_de_pedido(self):
        solicitud = self.crear()
        for estado in ("aceptado", "en_produccion", "entregado", "pago_confirmado", "inventado"):
            with self.subTest(estado=estado):
                self.comprobar_constraint(solicitud, {"estado": estado})

    def test_cantidad_cero_no_pasa_escritura_directa(self):
        self.comprobar_constraint(self.crear().renglones.get(), {"cantidad": 0})

    def test_cantidad_negativa_no_pasa_escritura_directa(self):
        self.comprobar_constraint(self.crear().renglones.get(), {"cantidad": -1})

    def test_posicion_positiva(self):
        self.comprobar_constraint(self.crear().renglones.get(), {"posicion": 0})

    def test_posicion_unica_por_solicitud(self):
        solicitud = self.crear()
        with self.assertRaises(IntegrityError), transaction.atomic():
            RenglonSolicitud.objects.create(
                solicitud=solicitud,
                producto=self.otro_producto,
                posicion=1,
                modalidad="stock",
                cantidad=1,
            )

    def test_modalidad_valida_en_bd(self):
        self.comprobar_constraint(self.crear().renglones.get(), {"modalidad": "mixto"})

    def test_resolucion_valida_en_bd(self):
        self.comprobar_constraint(self.crear().renglones.get(), {"resolucion": "confirmado"})

    def test_rechazo_exige_motivo_en_bd(self):
        renglon = self.crear().renglones.get()
        for motivo in ("", " \n "):
            with self.subTest(motivo=motivo):
                self.comprobar_constraint(
                    renglon, {"resolucion": "rechazado", "motivo_rechazo": motivo}
                )

    def test_rechazo_exige_motivo_en_modelo(self):
        renglon = self.crear().renglones.get()
        renglon.resolucion = ResolucionRenglon.RECHAZADO
        with self.assertRaises(ValidationError):
            renglon.full_clean()

    def test_aceptado_no_usa_motivo(self):
        renglon = self.crear().renglones.get()
        self.comprobar_constraint(renglon, {"resolucion": "aceptado", "motivo_rechazo": "Motivo"})
        renglon.resolucion = ResolucionRenglon.ACEPTADO
        renglon.full_clean()
        renglon.save()
        self.assertEqual(renglon.motivo_rechazo, "")

    def test_pendiente_no_usa_motivo(self):
        self.comprobar_constraint(self.crear().renglones.get(), {"motivo_rechazo": "Motivo"})

    def test_stock_no_tiene_fecha_produccion(self):
        self.comprobar_constraint(self.crear().renglones.get(), {"fecha_solicitada": self.fecha})

    def test_produccion_exige_fecha_en_bd(self):
        self.comprobar_constraint(self.crear().renglones.get(), {"modalidad": "produccion"})

    def test_personalizacion_exige_caracteristicas_en_bd(self):
        self.comprobar_constraint(
            self.crear().renglones.get(),
            {
                "modalidad": "personalizacion",
                "origen_personalizacion": "desde_cero",
            },
        )

    def test_personalizacion_exige_origen_en_bd(self):
        self.comprobar_constraint(
            self.crear().renglones.get(),
            {
                "modalidad": "personalizacion",
                "caracteristicas": "Iniciales",
            },
        )

    def test_origenes_validos_sin_relacion_con_inventario(self):
        self.assertEqual(set(OrigenPersonalizacion.values), {"desde_cero", "unidad_estandar"})
        campos = {c.name for c in RenglonSolicitud._meta.fields}
        self.assertNotIn("reserva", campos)
        self.assertNotIn("unidad_inventario", campos)

    def test_modelo_valida_mismo_taller(self):
        solicitud = self.crear()
        renglon = RenglonSolicitud(
            solicitud=solicitud,
            producto=self.producto_ajeno,
            posicion=2,
            modalidad="stock",
            cantidad=1,
        )
        with self.assertRaises(ValidationError):
            renglon.full_clean()

    def test_no_revalida_fecha_historica_como_nueva(self):
        solicitud = self.crear(
            datos_renglon(self.producto, modalidad="produccion", fecha_solicitada=self.fecha)
        )
        renglon = solicitud.renglones.get()
        renglon.fecha_solicitada = timezone.localdate() - timedelta(days=1)
        renglon.save()
        renglon.full_clean()

    def test_relaciones_protegen_el_historial(self):
        solicitud = self.crear()
        for objeto in (solicitud, self.producto, self.taller, self.comprador, self.categoria):
            with self.subTest(modelo=type(objeto).__name__):
                with self.assertRaises(ProtectedError):
                    objeto.delete()
        self.assertEqual(solicitud.renglones.count(), 1)

    def test_no_se_congela_precio_del_catalogo(self):
        solicitud = self.crear()
        catalogo.actualizar_producto(self.producto, precio="950.00")
        self.assertEqual(solicitud.renglones.get().producto.precio, 950)
        campos = {c.name for c in RenglonSolicitud._meta.fields}
        self.assertFalse({"precio", "precio_unitario", "subtotal", "cotizacion"} & campos)

    def test_dominio_solo_persiste_solicitud_y_renglon(self):
        modelos = {m.__name__ for m in apps.get_app_config("solicitudes").get_models()}
        # La propuesta (apps.propuestas) y el pedido confirmado (apps.pedidos) son entidades aparte.
        self.assertEqual(modelos, {"Solicitud", "RenglonSolicitud", "RevisionRenglonSolicitud"})

    def test_crear_no_produce_efectos_en_otros_dominios(self):
        modelos = [
            m
            for m in apps.get_models()
            if m._meta.app_label in {"accounts", "talleres", "catalogo"}
        ]
        antes = {m._meta.label: m.objects.count() for m in modelos}
        self.crear()
        self.assertEqual(antes, {m._meta.label: m.objects.count() for m in modelos})

    def test_sin_contraoferta_de_cantidad_ni_etapas_futuras(self):
        campos = {c.name for c in RenglonSolicitud._meta.fields} | {
            c.name for c in Solicitud._meta.fields
        }
        self.assertFalse(
            {
                "cantidad_propuesta",
                "contraoferta",
                "nueva_cantidad",
                "propuesta",
                "pedido",
                "pago",
                "reserva",
                "chat",
                "total",
                "fecha_comprometida",
            }
            & campos
        )
