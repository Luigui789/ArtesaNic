"""Proceso automático de vencimiento por falta de pago (AUD-11; RN-013, D-AUD11-12/13/14).

    python manage.py procesar_vencimientos_pago --once          # una iteración (mantenimiento)
    python manage.py procesar_vencimientos_pago --interval 60   # modo continuo (servicio)

Corre en un proceso propio (servicio ``vencimientos`` de Compose), nunca dentro del servidor
HTTP. La cadencia es operativa: el plazo comercial es exacto y el vencimiento físico ocurre a
más tardar un intervalo después. Varias instancias pueden convivir: los locks y la
revalidación garantizan una sola transición por pedido.
"""

import logging
import time

from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections, connection

from apps.pedidos import vencimiento

logger = logging.getLogger(__name__)

INTERVALO_POR_DEFECTO = 60


class Command(BaseCommand):
    help = "Vence los pedidos sin pago dentro de plazo y libera sus reservas activas."

    # Inyectable en pruebas: el modo continuo no duerme de verdad.
    dormir = staticmethod(time.sleep)

    def add_arguments(self, parser):
        modo = parser.add_mutually_exclusive_group()
        modo.add_argument("--once", action="store_true", help="Ejecuta una sola iteración.")
        modo.add_argument(
            "--interval",
            type=int,
            default=INTERVALO_POR_DEFECTO,
            help=f"Segundos entre iteraciones (por defecto {INTERVALO_POR_DEFECTO}).",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=vencimiento.TAMANO_LOTE,
            help=f"Pedidos por lote (por defecto {vencimiento.TAMANO_LOTE}).",
        )
        parser.add_argument(
            "--max-iterations",
            type=int,
            default=None,
            help="Límite de iteraciones del modo continuo (pruebas y diagnóstico).",
        )

    def handle(self, *args, once, interval, batch_size, max_iterations, **options):
        if interval < 1:
            raise CommandError("--interval debe ser al menos 1 segundo.")
        if batch_size < 1:
            raise CommandError("--batch-size debe ser al menos 1.")
        if once:
            self.iteracion(batch_size)
            return
        logger.info("Proceso de vencimientos iniciado: intervalo=%ss lote=%s", interval, batch_size)
        iteraciones = 0
        try:
            while max_iterations is None or iteraciones < max_iterations:
                self.iteracion(batch_size)
                iteraciones += 1
                if max_iterations is None or iteraciones < max_iterations:
                    self.dormir(interval)
        except KeyboardInterrupt:
            logger.info("Proceso de vencimientos detenido.")

    def iteracion(self, batch_size: int) -> vencimiento.ResultadoCiclo:
        # Un proceso de larga vida descarta conexiones caídas u obsoletas entre iteraciones,
        # como hace Django en cada petición. Dentro de una transacción externa no aplica.
        if not connection.in_atomic_block:
            close_old_connections()
        resultado = vencimiento.procesar_vencimientos(tamano_lote=batch_size)
        self.stdout.write(
            f"vencidos={resultado.vencidos} no_elegibles={resultado.no_elegibles} "
            f"errores={resultado.errores}"
        )
        return resultado
