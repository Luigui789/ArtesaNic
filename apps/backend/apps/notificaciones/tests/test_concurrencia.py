import threading

from django.db import connections

from apps.notificaciones.models import Notificacion
from apps.notificaciones.services import emitir
from apps.propuestas.tests.test_concurrencia import CarreraTestCase


class ConcurrenciaNotificacionesTest(CarreraTestCase):
    def test_dos_emisores_misma_clave(self):
        solicitud = self.nueva_solicitud()
        barrera = threading.Barrier(2)
        resultados, errores = [], []

        def ejecutar():
            try:
                barrera.wait(timeout=10)
                aviso = emitir(
                    destinatario_id=self.comprador.pk,
                    tipo="solicitud_rechazada",
                    clave_evento="prueba:solicitud:1",
                    solicitud_id=solicitud.pk,
                )
                resultados.append(aviso.pk)
            except Exception as exc:
                errores.append(exc)
            finally:
                connections.close_all()

        hilos = [threading.Thread(target=ejecutar) for _ in range(2)]
        for hilo in hilos:
            hilo.start()
        for hilo in hilos:
            hilo.join(timeout=20)
            self.assertFalse(hilo.is_alive())
        self.assertEqual(errores, [])
        self.assertEqual(len(resultados), 2)
        self.assertEqual(resultados[0], resultados[1])
        self.assertEqual(Notificacion.objects.filter(clave_evento="prueba:solicitud:1").count(), 1)
