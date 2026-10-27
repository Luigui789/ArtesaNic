#!/usr/bin/env python3
"""Validador de la matriz de trazabilidad y cobertura de requisitos V1 (AUD-19).

Comprueba que ``docs/trazabilidad/cobertura-v1.json`` y ``docs/trazabilidad/cobertura-v1.md``
permanezcan sincronizados con las fuentes normativas canónicas:
- ``docs/requisitos/requisitos.md`` (21 RF activos, 15 RNF activos y 3 RF no activos en V1)
- ``docs/requisitos/reglas-de-negocio.md`` (24 RN activas)

Verifica además que todas las rutas de implementación y evidencia existan en el repositorio,
que los símbolos de prueba referenciados existan realmente en sus archivos, que las pruebas
exclusivas del modo demo no se utilicen como evidencia del sistema real y que los estados de
cobertura cumplan las invariantes de honestidad de AUD-19.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from functools import cache
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_JSON = REPO_ROOT / "docs" / "trazabilidad" / "cobertura-v1.json"
DEFAULT_MD = REPO_ROOT / "docs" / "trazabilidad" / "cobertura-v1.md"
DEFAULT_REQUISITOS = REPO_ROOT / "docs" / "requisitos" / "requisitos.md"
DEFAULT_REGLAS = REPO_ROOT / "docs" / "requisitos" / "reglas-de-negocio.md"

ESTADOS_VALIDOS = frozenset(
    {
        "AUTOMATED",
        "PARTIAL",
        "MANUAL_EVIDENCE",
        "DEFERRED",
        "NOT_IMPLEMENTED",
        "NOT_VERIFIED",
    }
)

NIVELES_EVIDENCIA_VALIDOS = frozenset(
    {
        "unit",
        "domain",
        "api",
        "frontend",
        "contract",
        "integration",
        "smoke",
        "static",
        "ci",
    }
)

TIPOS_VALIDOS = frozenset({"RF", "RNF", "RN"})

FOCO_AUD19_IDS = (
    "RF-004",
    "RF-005",
    "RF-010",
    "RF-015",
    "RF-022",
    "RN-002",
    "RN-008",
    "RN-009",
    "RN-011",
    "RN-023",
    "RN-024",
    "RNF-015",
)

PATRONES_DEMO_PROHIBIDOS = (
    "apps/frontend/src/mocks/",
    "apps/frontend/scripts/check-demo.mjs",
    "order-chat-demo.tsx",
    "notificaciones-demo.tsx",
    "use-notifications-demo.tsx",
    "comprobante-demo.svg",
)

RE_FILA_ALCANCE = re.compile(
    r"^\|\s*\[(?P<id>(?:RF|RNF)-\d{3})\]\(#[^)]+\)\s*\|\s*(?P<nombre>[^|]+?)\s*\|\s*(?P<alcance>[^|]+?)\s*\|$"
)
RE_FILA_RN = re.compile(r"^\|\s*\[(?P<id>RN-\d{3})\]\(#[^)]+\)\s*\|\s*(?P<nombre>[^|]+?)\s*\|$")
RE_ENCABEZADO_REQ = re.compile(r"^##\s+(?P<id>(?:RF|RNF|RN)-\d{3})\s*$", re.MULTILINE)
RE_TICKET_PENDIENTE = re.compile(r"^AUD-\d{2}$")


def extraer_requisitos_canonicos(
    ruta_requisitos: Path, ruta_reglas: Path
) -> tuple[dict[str, dict[str, str]], dict[str, dict[str, str]], list[str]]:
    """Extrae los requisitos activos y no activos desde los documentos normativos canónicos."""
    errores: list[str] = []
    activos: dict[str, dict[str, str]] = {}
    no_activos: dict[str, dict[str, str]] = {}

    if not ruta_requisitos.is_file():
        errores.append(f"No existe la fuente canónica de requisitos: {ruta_requisitos}")
        return activos, no_activos, errores
    if not ruta_reglas.is_file():
        errores.append(f"No existe la fuente canónica de reglas de negocio: {ruta_reglas}")
        return activos, no_activos, errores

    texto_req = ruta_requisitos.read_text(encoding="utf-8")
    encabezados_req = set(RE_ENCABEZADO_REQ.findall(texto_req))

    for linea in texto_req.splitlines():
        m = RE_FILA_ALCANCE.match(linea.strip())
        if not m:
            continue
        req_id = m.group("id")
        nombre = m.group("nombre").strip()
        alcance = m.group("alcance").strip()
        tipo = "RNF" if req_id.startswith("RNF-") else "RF"
        if req_id not in encabezados_req:
            errores.append(
                f"El requisito {req_id} aparece en el índice de {ruta_requisitos.name} "
                f"pero no tiene sección '## {req_id}'."
            )
        info = {
            "id": req_id,
            "tipo": tipo,
            "nombre": nombre,
            "alcance": alcance,
            "archivo": "docs/requisitos/requisitos.md",
        }
        if alcance == "Activo":
            if req_id in activos:
                errores.append(f"ID activo duplicado en {ruta_requisitos.name}: {req_id}")
            activos[req_id] = info
        else:
            if req_id in no_activos:
                errores.append(f"ID no activo duplicado en {ruta_requisitos.name}: {req_id}")
            no_activos[req_id] = info

    texto_rn = ruta_reglas.read_text(encoding="utf-8")
    encabezados_rn = set(RE_ENCABEZADO_REQ.findall(texto_rn))

    for linea in texto_rn.splitlines():
        m = RE_FILA_RN.match(linea.strip())
        if not m:
            continue
        rn_id = m.group("id")
        nombre = m.group("nombre").strip()
        if rn_id not in encabezados_rn:
            errores.append(
                f"La regla {rn_id} aparece en el índice de {ruta_reglas.name} "
                f"pero no tiene sección '## {rn_id}'."
            )
        if rn_id in activos:
            errores.append(f"ID de regla duplicado en {ruta_reglas.name}: {rn_id}")
        activos[rn_id] = {
            "id": rn_id,
            "tipo": "RN",
            "nombre": nombre,
            "alcance": "Activo",
            "archivo": "docs/requisitos/reglas-de-negocio.md",
        }

    if not activos:
        errores.append("No se pudo extraer ningún requisito activo de las fuentes canónicas.")

    return activos, no_activos, errores


@cache
def _simbolos_python(ruta_archivo: Path) -> frozenset[str]:
    """Devuelve nombres de clases, funciones, métodos y variables de un archivo .py."""
    arbol = ast.parse(ruta_archivo.read_text(encoding="utf-8"), filename=str(ruta_archivo))
    simbolos: set[str] = set()

    for nodo in ast.walk(arbol):
        if isinstance(nodo, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            simbolos.add(nodo.name)
            if isinstance(nodo, ast.ClassDef):
                for sub in nodo.body:
                    if isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        simbolos.add(sub.name)
                        simbolos.add(f"{nodo.name}.{sub.name}")
        elif isinstance(nodo, ast.Assign):
            for target in nodo.targets:
                if isinstance(target, ast.Name):
                    simbolos.add(target.id)
        elif isinstance(nodo, ast.AnnAssign) and isinstance(nodo.target, ast.Name):
            simbolos.add(nodo.target.id)

    return frozenset(simbolos)


@cache
def _leer_texto_cacheado(ruta_archivo: Path) -> str:
    return ruta_archivo.read_text(encoding="utf-8")


def verificar_simbolo_en_archivo(ruta_archivo: Path, simbolo: str) -> bool:
    """Comprueba que ``simbolo`` exista en ``ruta_archivo``."""
    if not simbolo or not isinstance(simbolo, str):
        return False
    if ruta_archivo.suffix == ".py":
        try:
            simbolos = _simbolos_python(ruta_archivo)
        except SyntaxError:
            return False
        return simbolo in simbolos

    contenido = _leer_texto_cacheado(ruta_archivo)
    return simbolo in contenido


def es_ruta_demo(ruta_relativa: str) -> bool:
    normalizada = ruta_relativa.replace("\\", "/").strip()
    return any(patron in normalizada for patron in PATRONES_DEMO_PROHIBIDOS)


def validar_cobertura(
    *,
    repo_root: Path = REPO_ROOT,
    ruta_json: Path = DEFAULT_JSON,
    ruta_md: Path = DEFAULT_MD,
    ruta_requisitos: Path = DEFAULT_REQUISITOS,
    ruta_reglas: Path = DEFAULT_REGLAS,
) -> list[str]:
    """Ejecuta todas las validaciones de trazabilidad y devuelve la lista de errores."""
    errores: list[str] = []

    canonicos_activos, canonicos_no_activos, errores_canonicos = extraer_requisitos_canonicos(
        ruta_requisitos, ruta_reglas
    )
    errores.extend(errores_canonicos)
    if errores_canonicos:
        return errores

    if not ruta_json.is_file():
        return [f"No existe el archivo de trazabilidad JSON: {ruta_json}"]
    if not ruta_md.is_file():
        return [f"No existe el archivo de trazabilidad Markdown: {ruta_md}"]

    try:
        datos: dict[str, Any] = json.loads(ruta_json.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"JSON inválido en {ruta_json}: {exc}"]

    if not isinstance(datos, dict):
        return [f"La raíz de {ruta_json} debe ser un objeto JSON."]

    lista_activos = datos.get("requisitos")
    if not isinstance(lista_activos, list):
        errores.append("El campo 'requisitos' debe ser una lista.")
        return errores

    lista_no_activos = datos.get("requisitos_no_activos")
    if not isinstance(lista_no_activos, list):
        errores.append("El campo 'requisitos_no_activos' debe ser una lista.")
        return errores

    # 1. Validar IDs activos (unicidad, completitud, no inclusión de retirados/postergados)
    vistos_activos: set[str] = set()
    mapa_activos_json: dict[str, dict[str, Any]] = {}
    for idx, item in enumerate(lista_activos):
        if not isinstance(item, dict):
            errores.append(f"requisitos[{idx}] no es un objeto.")
            continue
        req_id = item.get("id")
        if not isinstance(req_id, str) or not req_id:
            errores.append(f"requisitos[{idx}] carece de 'id' válido.")
            continue
        if req_id in vistos_activos:
            errores.append(f"ID duplicado en 'requisitos': {req_id}")
            continue
        vistos_activos.add(req_id)
        mapa_activos_json[req_id] = item

        if req_id in canonicos_no_activos:
            errores.append(
                f"El requisito no activo/postergado {req_id} "
                "no puede figurar como activo en 'requisitos'."
            )
        elif req_id not in canonicos_activos:
            errores.append(f"ID desconocido o inexistente en fuentes canónicas: {req_id}")

    faltantes_activos = sorted(set(canonicos_activos) - vistos_activos)
    if faltantes_activos:
        errores.append(
            "Faltan requisitos activos en cobertura-v1.json: " + ", ".join(faltantes_activos)
        )

    # 2. Validar requisitos no activos (RF-002, RF-012, RF-024)
    vistos_no_activos: set[str] = set()
    for idx, item in enumerate(lista_no_activos):
        if not isinstance(item, dict):
            errores.append(f"requisitos_no_activos[{idx}] no es un objeto.")
            continue
        req_id = item.get("id")
        if not isinstance(req_id, str) or not req_id:
            errores.append(f"requisitos_no_activos[{idx}] carece de 'id' válido.")
            continue
        if req_id in vistos_no_activos:
            errores.append(f"ID duplicado en 'requisitos_no_activos': {req_id}")
            continue
        vistos_no_activos.add(req_id)
        if req_id not in canonicos_no_activos:
            errores.append(
                "ID en 'requisitos_no_activos' no corresponde a un requisito "
                f"no activo canónico: {req_id}"
            )
        for campo in ("tipo", "resumen", "estado_normativo", "explicacion"):
            if not isinstance(item.get(campo), str) or not item.get(campo, "").strip():
                errores.append(
                    f"requisitos_no_activos[{req_id}] requiere el campo no vacío '{campo}'."
                )

    faltantes_no_activos = sorted(set(canonicos_no_activos) - vistos_no_activos)
    if faltantes_no_activos:
        errores.append(
            "Faltan requisitos no activos en 'requisitos_no_activos': "
            + ", ".join(faltantes_no_activos)
        )

    # 3. Validar cada requisito activo en detalle
    cache_textos: dict[Path, str] = {}

    for req_id, item in mapa_activos_json.items():
        canon = canonicos_activos.get(req_id)
        tipo = item.get("tipo")
        if tipo not in TIPOS_VALIDOS:
            errores.append(f"[{req_id}] 'tipo' inválido: {tipo!r}")
        elif canon and tipo != canon["tipo"]:
            errores.append(
                f"[{req_id}] 'tipo' ({tipo}) no coincide con el tipo canónico ({canon['tipo']})."
            )

        for campo_str in ("resumen", "dominio"):
            valor = item.get(campo_str)
            if not isinstance(valor, str) or not valor.strip():
                errores.append(f"[{req_id}] '{campo_str}' debe ser un string no vacío.")

        # Fuente documental
        fuente = item.get("fuente")
        if not isinstance(fuente, dict):
            errores.append(f"[{req_id}] 'fuente' debe ser un objeto con 'archivo' y 'seccion'.")
        else:
            archivo_fuente = fuente.get("archivo")
            seccion_fuente = fuente.get("seccion")
            if not isinstance(archivo_fuente, str) or not archivo_fuente.strip():
                errores.append(f"[{req_id}] 'fuente.archivo' vacío o inválido.")
            else:
                ruta_f = repo_root / archivo_fuente
                if not ruta_f.is_file():
                    errores.append(f"[{req_id}] No existe 'fuente.archivo': {archivo_fuente}")
                else:
                    if ruta_f not in cache_textos:
                        cache_textos[ruta_f] = ruta_f.read_text(encoding="utf-8")
                    if (
                        seccion_fuente != req_id
                        or f"## {seccion_fuente}" not in cache_textos[ruta_f]
                    ):
                        errores.append(
                            f"[{req_id}] 'fuente.seccion' ({seccion_fuente!r}) no coincide con "
                            f"'## {req_id}' en {archivo_fuente}."
                        )

        # Estado de cobertura
        estado = item.get("estado_cobertura")
        if estado not in ESTADOS_VALIDOS:
            errores.append(
                f"[{req_id}] 'estado_cobertura' inválido: {estado!r}. "
                f"Debe ser uno de {sorted(ESTADOS_VALIDOS)}."
            )

        # Implementación
        implementacion = item.get("implementacion")
        if not isinstance(implementacion, list) or not all(
            isinstance(x, str) and x.strip() for x in implementacion
        ):
            errores.append(f"[{req_id}] 'implementacion' debe ser una lista de rutas no vacías.")
            implementacion = []
        for ruta_impl in implementacion:
            if es_ruta_demo(ruta_impl):
                errores.append(
                    f"[{req_id}] Prohibido referenciar archivos del modo demo en "
                    f"'implementacion': {ruta_impl}"
                )
            if not (repo_root / ruta_impl).exists():
                errores.append(
                    f"[{req_id}] Ruta de 'implementacion' inexistente en el "
                    f"repositorio: {ruta_impl}"
                )

        # Evidencia automatizada
        evidencia_auto = item.get("evidencia_automatizada")
        if not isinstance(evidencia_auto, list):
            errores.append(f"[{req_id}] 'evidencia_automatizada' debe ser una lista.")
            evidencia_auto = []
        for ev_idx, ev in enumerate(evidencia_auto):
            if not isinstance(ev, dict):
                errores.append(f"[{req_id}] evidencia_automatizada[{ev_idx}] debe ser un objeto.")
                continue
            arch_ev = ev.get("archivo")
            simb_ev = ev.get("simbolo")
            nivel_ev = ev.get("nivel")
            if not isinstance(arch_ev, str) or not arch_ev.strip():
                errores.append(
                    f"[{req_id}] evidencia_automatizada[{ev_idx}] carece de 'archivo' válido."
                )
                continue
            if es_ruta_demo(arch_ev):
                errores.append(
                    f"[{req_id}] Prohibido usar pruebas/archivos DEMO_ONLY como "
                    f"evidencia real: {arch_ev}"
                )
            ruta_ev = repo_root / arch_ev
            if not ruta_ev.is_file():
                errores.append(
                    f"[{req_id}] Archivo de evidencia inexistente en el repositorio: {arch_ev}"
                )
            else:
                if not isinstance(simb_ev, str) or not simb_ev.strip():
                    errores.append(
                        f"[{req_id}] evidencia_automatizada[{ev_idx}] ({arch_ev}) "
                        "carece de 'simbolo'."
                    )
                elif not verificar_simbolo_en_archivo(ruta_ev, simb_ev):
                    errores.append(
                        f"[{req_id}] Símbolo '{simb_ev}' no encontrado en el archivo "
                        f"de evidencia '{arch_ev}'."
                    )
            if nivel_ev not in NIVELES_EVIDENCIA_VALIDOS:
                errores.append(
                    f"[{req_id}] Nivel de evidencia inválido en {arch_ev}: {nivel_ev!r}."
                )

        # Evidencia manual
        evidencia_manual = item.get("evidencia_manual")
        if not isinstance(evidencia_manual, list) or not all(
            isinstance(x, str) and x.strip() for x in evidencia_manual
        ):
            errores.append(f"[{req_id}] 'evidencia_manual' debe ser una lista de strings.")
            evidencia_manual = []
        for ruta_man in evidencia_manual:
            if not (repo_root / ruta_man).exists():
                errores.append(f"[{req_id}] Archivo de 'evidencia_manual' inexistente: {ruta_man}")

        # Pendiente en y observaciones
        pendiente_en = item.get("pendiente_en")
        if not isinstance(pendiente_en, list) or not all(
            isinstance(x, str) and RE_TICKET_PENDIENTE.match(x) for x in pendiente_en
        ):
            errores.append(
                f"[{req_id}] 'pendiente_en' debe ser una lista de identificadores "
                "de auditoría (ej. 'AUD-20')."
            )
            pendiente_en = []

        observaciones = item.get("observaciones")
        if not isinstance(observaciones, str):
            errores.append(f"[{req_id}] 'observaciones' debe ser un string.")
            observaciones = ""

        # Reglas de coherencia por estado
        if estado == "AUTOMATED":
            if not implementacion:
                errores.append(
                    f"[{req_id}] Estado AUTOMATED requiere al menos una ruta en 'implementacion'."
                )
            if not evidencia_auto:
                errores.append(
                    f"[{req_id}] Estado AUTOMATED requiere al menos una entrada "
                    "en 'evidencia_automatizada'."
                )
        elif estado == "PARTIAL":
            if not implementacion:
                errores.append(
                    f"[{req_id}] Estado PARTIAL requiere al menos una ruta en 'implementacion'."
                )
            if not evidencia_auto:
                errores.append(
                    f"[{req_id}] Estado PARTIAL requiere al menos una entrada "
                    "en 'evidencia_automatizada'."
                )
            if not observaciones.strip():
                errores.append(f"[{req_id}] Estado PARTIAL requiere 'observaciones' no vacías.")
        elif estado == "MANUAL_EVIDENCE":
            if not evidencia_manual:
                errores.append(
                    f"[{req_id}] Estado MANUAL_EVIDENCE requiere al menos una ruta "
                    "en 'evidencia_manual'."
                )
        elif estado == "DEFERRED":
            if not pendiente_en:
                errores.append(
                    f"[{req_id}] Estado DEFERRED requiere al menos un ticket en 'pendiente_en'."
                )
            if not observaciones.strip():
                errores.append(f"[{req_id}] Estado DEFERRED requiere 'observaciones' no vacías.")
        elif estado in {"NOT_IMPLEMENTED", "NOT_VERIFIED"}:
            if not observaciones.strip():
                errores.append(f"[{req_id}] Estado {estado} exige explicación en 'observaciones'.")

    # 4. Validar foco obligatorio de AUD-19
    foco = datos.get("foco_aud19")
    if not isinstance(foco, list):
        errores.append(
            "El campo 'foco_aud19' debe ser una lista con los 12 IDs prioritarios de AUD-19."
        )
    else:
        ids_foco = [x.get("id") for x in foco if isinstance(x, dict)]
        if set(ids_foco) != set(FOCO_AUD19_IDS) or len(ids_foco) != len(FOCO_AUD19_IDS):
            errores.append(
                f"'foco_aud19' debe contener exactamente {list(FOCO_AUD19_IDS)}; "
                f"contiene {ids_foco}."
            )
        for item_foco in foco:
            if not isinstance(item_foco, dict):
                continue
            fid = item_foco.get("id", "?")
            for campo_foco in (
                "expectativa_historica_sustituida",
                "implementacion_actual",
                "huecos_reales",
            ):
                if (
                    not isinstance(item_foco.get(campo_foco), str)
                    or not item_foco.get(campo_foco, "").strip()
                ):
                    errores.append(f"foco_aud19[{fid}] requiere el campo '{campo_foco}' no vacío.")

    # 5. Validar bloque resumen del JSON
    resumen = datos.get("resumen")
    if not isinstance(resumen, dict):
        errores.append("El archivo JSON debe incluir el objeto 'resumen'.")
    else:
        conteo_por_tipo = {"RF": 0, "RNF": 0, "RN": 0}
        conteo_por_estado = {e: 0 for e in ESTADOS_VALIDOS}
        for item in mapa_activos_json.values():
            t = item.get("tipo")
            e = item.get("estado_cobertura")
            if t in conteo_por_tipo:
                conteo_por_tipo[t] += 1
            if e in conteo_por_estado:
                conteo_por_estado[e] += 1

        if resumen.get("total_activos") != len(mapa_activos_json):
            errores.append(
                f"resumen.total_activos ({resumen.get('total_activos')}) "
                f"!= {len(mapa_activos_json)}."
            )
        if resumen.get("total_no_activos") != len(vistos_no_activos):
            errores.append(
                f"resumen.total_no_activos ({resumen.get('total_no_activos')}) "
                f"!= {len(vistos_no_activos)}."
            )
        por_tipo_json = resumen.get("por_tipo", {})
        for t, cant in conteo_por_tipo.items():
            if por_tipo_json.get(t) != cant:
                errores.append(
                    f"resumen.por_tipo.{t} ({por_tipo_json.get(t)}) != {cant} calculado."
                )
        por_estado_json = resumen.get("por_estado", {})
        for e, cant in conteo_por_estado.items():
            if por_estado_json.get(e, 0) != cant:
                errores.append(
                    f"resumen.por_estado.{e} ({por_estado_json.get(e, 0)}) != {cant} calculado."
                )

    # 6. Validar sincronización con docs/trazabilidad/cobertura-v1.md
    texto_md = ruta_md.read_text(encoding="utf-8")
    for req_id, item in sorted(mapa_activos_json.items()):
        estado = item.get("estado_cobertura", "")
        patron_fila = re.compile(
            rf"^\|\s*(?:\[{re.escape(req_id)}\]\([^)]+\)|`?{re.escape(req_id)}`?)"
            rf"\s*\|[^\n]*?`{re.escape(str(estado))}`",
            re.MULTILINE,
        )
        if not patron_fila.search(texto_md):
            errores.append(
                f"Desincronización JSON/MD en {req_id} ({ruta_md.name}): "
                f"no se encontró fila con estado `{estado}`."
            )

    for no_activo_id in sorted(vistos_no_activos):
        if no_activo_id not in texto_md:
            errores.append(
                f"Desincronización en {ruta_md.name}: no se menciona el requisito "
                f"no activo {no_activo_id}."
            )

    return errores


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Valida la trazabilidad y cobertura de requisitos de ArtesaNic V1 (AUD-19)."
    )
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON, help="Ruta a cobertura-v1.json")
    parser.add_argument("--md", type=Path, default=DEFAULT_MD, help="Ruta a cobertura-v1.md")
    parser.add_argument(
        "--requisitos", type=Path, default=DEFAULT_REQUISITOS, help="Ruta a requisitos.md"
    )
    parser.add_argument(
        "--reglas", type=Path, default=DEFAULT_REGLAS, help="Ruta a reglas-de-negocio.md"
    )
    args = parser.parse_args(argv)

    errores = validar_cobertura(
        repo_root=REPO_ROOT,
        ruta_json=args.json,
        ruta_md=args.md,
        ruta_requisitos=args.requisitos,
        ruta_reglas=args.reglas,
    )
    if errores:
        for err in errores:
            print(f"ERROR: {err}", file=sys.stderr)
        print(
            f"\nFALLO check_requirements_coverage: {len(errores)} error(es) detectado(s).",
            file=sys.stderr,
        )
        return 1

    datos = json.loads(args.json.read_text(encoding="utf-8"))
    resumen = datos["resumen"]
    print(
        "OK check_requirements_coverage: "
        f"{resumen['total_activos']} activos ({resumen['por_tipo']}), "
        f"{resumen['total_no_activos']} no activos, "
        f"estados={resumen['por_estado']}, "
        "archivos, símbolos y vista Markdown sincronizados."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
