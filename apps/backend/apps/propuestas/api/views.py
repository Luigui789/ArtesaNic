from django.http import Http404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.api.permissions import EsComprador
from apps.operaciones.api import contrato as idempotencia
from apps.solicitudes.api.conflictos import errores_de_dominio, respuesta_conflicto
from apps.solicitudes.api.views import ERROR_ENTRADA, ERRORES, NO_ENCONTRADO, TAG
from apps.solicitudes.services import CodigoConflicto
from apps.talleres.api.permissions import EsArtesanoAprobado

from .. import selectors, services
from .serializers import (
    DecisionPropuestaEntradaSerializer,
    DecisionPropuestaSerializer,
    PropuestaEntradaSerializer,
    PropuestaSerializer,
)

DESCRIPCION_LECTURA = (
    "Propuesta final emitida: solo renglones aceptados, precio unitario cotizado por el "
    "servidor, subtotales, cargos de personalización, otros cargos, plan y costo de "
    "entrega, total en C$ y estado de decisión (`pendiente`, `aceptada`, `rechazada`). "
    "404 si aún no se emitió o la solicitud es ajena."
)


@method_decorator(never_cache, name="dispatch")
class MiPropuestaView(APIView):
    permission_classes = [EsComprador]

    @extend_schema(
        tags=[TAG],
        operation_id="consultar_propuesta_de_mi_solicitud",
        summary="Consultar la propuesta final de una solicitud propia",
        description=DESCRIPCION_LECTURA,
        responses={200: PropuestaSerializer, **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request, solicitud_id: int):
        propuesta = selectors.propuesta_del_comprador(request.user, solicitud_id)
        if propuesta is None:
            raise Http404
        return Response(PropuestaSerializer(propuesta).data)


@method_decorator(never_cache, name="dispatch")
class PropuestaRecibidaView(APIView):
    permission_classes = [EsArtesanoAprobado]

    @extend_schema(
        tags=[TAG],
        operation_id="consultar_propuesta_recibida",
        summary="Consultar la propuesta final de una solicitud del taller propio",
        description=DESCRIPCION_LECTURA,
        responses={200: PropuestaSerializer, **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request, solicitud_id: int):
        propuesta = selectors.propuesta_del_taller(request.user.taller, solicitud_id)
        if propuesta is None:
            raise Http404
        return Response(PropuestaSerializer(propuesta).data)

    @extend_schema(
        tags=[TAG],
        operation_id="emitir_propuesta",
        summary="Emitir la propuesta final de una solicitud revisada",
        description="Requiere todos los renglones resueltos y al menos uno aceptado (estado "
        "lista_propuesta). En una sola transacción toma el precio vigente de cada producto, "
        "calcula subtotales y total, crea la propuesta y pasa la solicitud a "
        "propuesta_emitida. `lineas` debe contener exactamente los renglones aceptados; "
        "producción exige fecha_comprometida; cargo_personalizacion solo en personalización. "
        "El cliente no envía precios, subtotales, total, comprador, taller ni estado (400). "
        "Una sola propuesta por solicitud; no se edita ni se regenera. No crea pedido ni "
        "reserva inventario. Protegida contra reintentos (AUD-08): la huella incluye la "
        "solicitud y todas las condiciones; repetir la misma clave devuelve la misma "
        "propuesta con 201 e Idempotency-Replayed. " + idempotencia.CLAVE_INVALIDA,
        request=PropuestaEntradaSerializer,
        parameters=[idempotencia.PARAMETRO_CLAVE, idempotencia.PARAMETRO_REPETIDA],
        responses={
            201: PropuestaSerializer,
            400: ERROR_ENTRADA,
            **ERRORES,
            404: NO_ENCONTRADO,
            409: respuesta_conflicto(
                CodigoConflicto.RENGLONES_PENDIENTES,
                CodigoConflicto.SOLICITUD_RECHAZADA,
                CodigoConflicto.SIN_RENGLONES_ACEPTADOS,
                CodigoConflicto.PROPUESTA_YA_EMITIDA,
            ),
        },
    )
    def post(self, request, solicitud_id: int):
        clave = idempotencia.clave_de_peticion(request)
        entrada = PropuestaEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        with errores_de_dominio():
            resultado = services.finalizar_propuesta_idempotente(
                artesano=request.user,
                clave=clave,
                solicitud_id=solicitud_id,
                **entrada.validated_data,
            )
        propuesta = selectors.propuesta_del_taller(request.user.taller, solicitud_id)
        return idempotencia.respuesta_idempotente(resultado, PropuestaSerializer(propuesta).data)


@method_decorator(never_cache, name="dispatch")
class DecisionPropuestaView(APIView):
    permission_classes = [EsComprador]

    @extend_schema(
        tags=[TAG],
        operation_id="decidir_propuesta",
        summary="Aceptar o rechazar la propuesta final de una solicitud propia",
        description="Decisión final e inmutable del comprador propietario sobre la propuesta "
        "emitida (AUD-07; RF-005, RF-006, RF-018, RF-022; RN-009, RN-011, RN-016). "
        "Si envía `rechazar`, registra la decisión histórica sin crear pedido ni reservar "
        "inventario (`pedido: null`). Si envía `aceptar`, en una única transacción PostgreSQL "
        "agrega las unidades estándar requeridas por producto (`stock` y `personalizacion` con "
        "`unidad_estandar`), bloquea y revalida el inventario disponible, registra la decisión "
        "`aceptada`, congela el `Pedido` con su snapshot contractual y crea las reservas "
        "activas y los movimientos de reserva. Una propuesta ya decidida con otra clave "
        "responde `409 propuesta_ya_decidida`; la falta de stock disponible revierte toda la "
        "transacción y responde `409 stock_insuficiente`. Protegida por `Idempotency-Key` "
        "(AUD-08). " + idempotencia.CLAVE_INVALIDA,
        request=DecisionPropuestaEntradaSerializer,
        parameters=[idempotencia.PARAMETRO_CLAVE, idempotencia.parametro_repetida(200)],
        responses={
            200: DecisionPropuestaSerializer,
            400: ERROR_ENTRADA,
            **ERRORES,
            404: NO_ENCONTRADO,
            409: respuesta_conflicto(
                CodigoConflicto.PROPUESTA_YA_DECIDIDA,
                CodigoConflicto.STOCK_INSUFICIENTE,
            ),
        },
    )
    def post(self, request, solicitud_id: int):
        clave = idempotencia.clave_de_peticion(request)
        entrada = DecisionPropuestaEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        with errores_de_dominio():
            resultado = services.decidir_propuesta_idempotente(
                comprador=request.user,
                clave=clave,
                solicitud_id=solicitud_id,
                **entrada.validated_data,
            )
        decision = selectors.decision_del_comprador(request.user, solicitud_id)
        return idempotencia.respuesta_idempotente(
            resultado, DecisionPropuestaSerializer(decision).data
        )
