"""AUD-13 — distribución económica congelada y cálculo de reembolsos (RF-006.4, RF-021.3;
D-AUD13-08..11). Aritmética de centavos: sumas exactas, mayor residuo y empate por posición."""

from collections import Counter
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from apps.pedidos import reembolsos
from apps.pedidos.models import (
    CargoPedido,
    DistribucionEconomicaLineaPedido,
    LineaPedido,
    Pedido,
)
from apps.pedidos.services import completar_distribuciones_pedido
from apps.propuestas.distribucion import (
    BaseLinea,
    completar_distribuciones,
    distribuir,
    repartir,
)
from apps.propuestas.models import (
    CargoPropuesta,
    DistribucionEconomicaLineaPropuesta,
    LineaPropuesta,
    Propuesta,
)

from .base_cumplimiento import personalizacion, produccion, stock
from .base_resolucion import ResolucionTestCase, confirmar_con_cargos

D = Decimal


def bases(*valores):
    return [BaseLinea(clave=i, posicion=i, base=D(v)) for i, v in enumerate(valores, start=1)]


class AlgoritmoTests(SimpleTestCase):
    def test_diez_entre_tres_lineas_iguales_suma_exacta_y_empate_por_posicion(self):
        partes = repartir(D("10.00"), bases("1.00", "1.00", "1.00"))
        self.assertEqual(sum(partes), D("10.00"))
        # 1000 centavos / 3 = 333 r1 cada una: el centavo sobrante va a la menor posición.
        self.assertEqual(partes, [D("3.34"), D("3.33"), D("3.33")])

    def test_empate_respeta_posicion_y_no_el_orden_de_entrada(self):
        lineas = [
            BaseLinea(clave=7, posicion=3, base=D("1.00")),
            BaseLinea(clave=8, posicion=1, base=D("1.00")),
            BaseLinea(clave=9, posicion=2, base=D("1.00")),
        ]
        self.assertEqual(repartir(D("0.02"), lineas), [D("0.00"), D("0.01"), D("0.01")])

    def test_mayor_residuo_gana_sobre_posicion(self):
        # 100 centavos con pesos 1/2/7 (de 10): 10, 20, 70 exactos; con 1 centavo extra:
        # 0.01 * 1/10 = 0.1 c, 0.2 c, 0.7 c → el mayor residuo (posición 3) recibe 1 c.
        self.assertEqual(
            repartir(D("0.01"), bases("1.00", "2.00", "7.00")), [D("0"), D("0"), D("0.01")]
        )

    def test_pool_cero_y_proporciones(self):
        self.assertEqual(repartir(D("0.00"), bases("5.00", "3.00")), [D("0.00"), D("0.00")])
        self.assertEqual(repartir(D("80.00"), bases("300.00", "100.00")), [D("60.00"), D("20.00")])

    def test_sumas_exactas_en_casos_variados(self):
        casos = [
            ("99.99", ["0.01", "0.01", "0.01", "0.01", "0.01", "0.01", "0.01"]),
            ("0.07", ["333.33", "333.33", "333.34"]),
            ("1234567.89", ["17.03", "1.99", "999999.99", "0.01"]),
            ("13.13", ["2.00"]),
        ]
        for pool, valores in casos:
            with self.subTest(pool=pool):
                partes = repartir(D(pool), bases(*valores))
                self.assertEqual(sum(partes), D(pool))
                self.assertTrue(all(p >= 0 for p in partes))

    def test_distribuir_reparte_cada_pool_por_separado(self):
        asignacion = distribuir(
            bases("100.00", "200.00"), pool_otros=D("10.00"), pool_entrega=D("0.01")
        )
        self.assertEqual(
            (asignacion[1].otros_compartidos_asignados, asignacion[2].otros_compartidos_asignados),
            (D("3.33"), D("6.67")),
        )
        self.assertEqual(
            (asignacion[1].entrega_asignada, asignacion[2].entrega_asignada), (D("0"), D("0.01"))
        )

    def test_importe_proporcional_half_up_exacto(self):
        self.assertEqual(reembolsos.importe_proporcional(D("10.00"), 1, 3), D("3.33"))
        self.assertEqual(reembolsos.importe_proporcional(D("10.00"), 2, 3), D("6.67"))
        # 0.05 * 1/2 = 0.025 → 0.03 con ROUND_HALF_UP (nunca redondeo bancario).
        self.assertEqual(reembolsos.importe_proporcional(D("0.05"), 1, 2), D("0.03"))
        self.assertEqual(reembolsos.importe_proporcional(D("12.34"), 0, 4), D("0.00"))
        self.assertEqual(reembolsos.importe_proporcional(D("12.34"), 4, 4), D("12.34"))


class DistribucionCongeladaTests(ResolucionTestCase):
    def setUp(self):
        super().setUp()
        self.otro = self.producto_con_stock(10, nombre="Plato", permite_personalizacion=True)

    def pedido_economico(self):
        """Stock (2 × precio), personalización con cargo 30, producción; cargo de línea 15
        sobre la personalización, dos globales (10 y 0.01) y entrega 50."""
        return confirmar_con_cargos(
            comprador=self.comprador,
            artesano=self.artesano,
            renglones=[
                stock(self.base, 2),
                personalizacion(self.otro, 3),
                produccion(self.base, 1),
            ],
            costo_entrega="50.00",
            cargos_pers={1: "30.00"},
            otros_cargos=[("15.00", 1), ("10.00", None), ("0.01", None)],
        )

    def test_la_propuesta_congela_la_distribucion_y_el_pedido_la_copia(self):
        pedido = self.pedido_economico()
        lineas = list(pedido.lineas.select_related("distribucion", "linea_propuesta__distribucion"))
        self.assertEqual(len(lineas), 3)
        otros = sum(linea.distribucion.otros_compartidos_asignados for linea in lineas)
        entrega = sum(linea.distribucion.entrega_asignada for linea in lineas)
        self.assertEqual((otros, entrega), (D("10.01"), pedido.costo_entrega))
        for linea in lineas:
            origen = linea.linea_propuesta.distribucion
            self.assertEqual(
                (
                    linea.distribucion.otros_compartidos_asignados,
                    linea.distribucion.entrega_asignada,
                ),
                (origen.otros_compartidos_asignados, origen.entrega_asignada),
            )

    def test_bases_reembolsables_suman_exactamente_el_total(self):
        pedido = self.pedido_economico()
        lineas = list(pedido.lineas.select_related("distribucion"))
        bases_linea = reembolsos.bases_reembolsables(pedido, lineas)
        self.assertEqual(sum(bases_linea.values()), pedido.total)
        personalizada = next(linea for linea in lineas if linea.modalidad == "personalizacion")
        cargo_linea = CargoPedido.objects.get(linea=personalizada).monto
        self.assertEqual(
            bases_linea[personalizada.pk],
            personalizada.subtotal
            + personalizada.cargo_personalizacion
            + cargo_linea
            + personalizada.distribucion.otros_compartidos_asignados
            + personalizada.distribucion.entrega_asignada,
        )

    def test_reembolso_parcial_exacto_al_centavo(self):
        pedido = self.pedido_economico()
        lineas = list(pedido.lineas.select_related("distribucion").order_by("posicion"))
        bases_linea = reembolsos.bases_reembolsables(pedido, lineas)
        entregadas = {lineas[0].pk: 1, lineas[1].pk: 1, lineas[2].pk: 1}
        calculadas = reembolsos.calcular_cierre(pedido, lineas, Counter(entregadas))
        esperado = [
            reembolsos.importe_proporcional(bases_linea[lineas[0].pk], 1, 2),
            reembolsos.importe_proporcional(bases_linea[lineas[1].pk], 2, 3),
            D("0.00"),
        ]
        self.assertEqual([c.importe_reembolso for c in calculadas], esperado)
        # Verificación independiente con aritmética Decimal exacta y ROUND_HALF_UP.
        base1 = bases_linea[lineas[1].pk]
        self.assertEqual(esperado[1], (base1 * 2 / 3).quantize(D("0.01"), "ROUND_HALF_UP"))
        self.assertTrue(0 < reembolsos.monto_total(calculadas) < pedido.total)

    def test_la_lectura_de_la_propuesta_expone_la_distribucion(self):
        pedido = self.pedido_economico()
        respuesta = self.client.get(f"/api/v1/solicitudes/mias/{pedido.solicitud_id}/propuesta/")
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        lineas = respuesta.data["lineas"]
        self.assertEqual(sum(D(lin["otros_compartidos_asignados"]) for lin in lineas), D("10.01"))
        self.assertEqual(sum(D(lin["entrega_asignada"]) for lin in lineas), D("50.00"))

    def test_backfill_dos_veces_sin_duplicar_ni_cambiar_importes(self):
        pedido = self.pedido_economico()
        antes = {
            "propuesta": sorted(
                DistribucionEconomicaLineaPropuesta.objects.values_list(
                    "linea_propuesta_id", "otros_compartidos_asignados", "entrega_asignada"
                )
            ),
            "pedido": sorted(
                DistribucionEconomicaLineaPedido.objects.values_list(
                    "linea_pedido_id", "otros_compartidos_asignados", "entrega_asignada"
                )
            ),
            "snapshot": list(Pedido.objects.filter(pk=pedido.pk).values()),
        }
        # Simula datos previos a AUD-13 borrando las distribuciones (SQL directo: el ORM
        # las protege) y completa dos veces con la función de la migración.
        DistribucionEconomicaLineaPedido.objects.all()._raw_delete("default")
        DistribucionEconomicaLineaPropuesta.objects.all()._raw_delete("default")
        argumentos_propuesta = {
            "Propuesta": Propuesta,
            "LineaPropuesta": LineaPropuesta,
            "CargoPropuesta": CargoPropuesta,
            "DistribucionEconomicaLineaPropuesta": DistribucionEconomicaLineaPropuesta,
        }
        argumentos_pedido = {
            "LineaPedido": LineaPedido,
            "DistribucionEconomicaLineaPedido": DistribucionEconomicaLineaPedido,
            "DistribucionEconomicaLineaPropuesta": DistribucionEconomicaLineaPropuesta,
        }
        self.assertEqual(completar_distribuciones(**argumentos_propuesta), 3)
        self.assertEqual(completar_distribuciones_pedido(**argumentos_pedido), 3)
        self.assertEqual(completar_distribuciones(**argumentos_propuesta), 0)
        self.assertEqual(completar_distribuciones_pedido(**argumentos_pedido), 0)
        despues = {
            "propuesta": sorted(
                DistribucionEconomicaLineaPropuesta.objects.values_list(
                    "linea_propuesta_id", "otros_compartidos_asignados", "entrega_asignada"
                )
            ),
            "pedido": sorted(
                DistribucionEconomicaLineaPedido.objects.values_list(
                    "linea_pedido_id", "otros_compartidos_asignados", "entrega_asignada"
                )
            ),
            "snapshot": list(Pedido.objects.filter(pk=pedido.pk).values()),
        }
        self.assertEqual(despues, antes)

    def test_la_distribucion_es_inmutable(self):
        pedido = self.pedido_economico()
        distribucion = DistribucionEconomicaLineaPedido.objects.filter(
            linea_pedido__pedido=pedido
        ).first()
        with self.assertRaises(ValidationError):
            distribucion.save()
        with self.assertRaises(ValidationError):
            distribucion.delete()
