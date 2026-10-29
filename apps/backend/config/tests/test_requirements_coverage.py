"""Pruebas unitarias del validador de trazabilidad y cobertura de requisitos V1 (AUD-19)."""

from __future__ import annotations

import copy
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

from django.test import SimpleTestCase

REPO_ROOT = Path(__file__).resolve().parents[4]
SCRIPT_PATH = REPO_ROOT / "infra" / "scripts" / "check_requirements_coverage.py"


def _cargar_modulo_checker():
    spec = importlib.util.spec_from_file_location("check_requirements_coverage", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = modulo
    spec.loader.exec_module(modulo)
    return modulo


checker = _cargar_modulo_checker()


class TrazabilidadRequisitosTests(SimpleTestCase):
    """Verifica las invariantes del validador ``infra/scripts/check_requirements_coverage.py``."""

    def setUp(self) -> None:
        self.datos_base = json.loads(checker.DEFAULT_JSON.read_text(encoding="utf-8"))
        self.md_base = checker.DEFAULT_MD.read_text(encoding="utf-8")

    def _ejecutar_con_mutacion(self, datos: dict, md_texto: str | None = None) -> list[str]:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            ruta_json = tmp_path / "cobertura-v1.json"
            ruta_md = tmp_path / "cobertura-v1.md"
            ruta_json.write_text(
                json.dumps(datos, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            ruta_md.write_text(
                self.md_base if md_texto is None else md_texto,
                encoding="utf-8",
            )
            return checker.validar_cobertura(
                repo_root=REPO_ROOT,
                ruta_json=ruta_json,
                ruta_md=ruta_md,
                ruta_requisitos=checker.DEFAULT_REQUISITOS,
                ruta_reglas=checker.DEFAULT_REGLAS,
            )

    def test_matriz_vigente_del_repositorio_es_valida(self) -> None:
        errores = checker.validar_cobertura()
        self.assertEqual(errores, [], f"La matriz vigente presentó errores: {errores}")

    def test_detecta_requisito_activo_faltante(self) -> None:
        datos = copy.deepcopy(self.datos_base)
        datos["requisitos"] = [r for r in datos["requisitos"] if r["id"] != "RF-004"]
        errores = self._ejecutar_con_mutacion(datos)
        self.assertTrue(
            any("Faltan requisitos activos" in e and "RF-004" in e for e in errores),
            errores,
        )

    def test_detecta_id_duplicado(self) -> None:
        datos = copy.deepcopy(self.datos_base)
        primero = copy.deepcopy(datos["requisitos"][0])
        datos["requisitos"].append(primero)
        errores = self._ejecutar_con_mutacion(datos)
        self.assertTrue(
            any("ID duplicado en 'requisitos'" in e for e in errores),
            errores,
        )

    def test_detecta_requisito_postergado_o_retirado_en_activos(self) -> None:
        datos = copy.deepcopy(self.datos_base)
        falso_activo = copy.deepcopy(datos["requisitos"][0])
        falso_activo["id"] = "RF-012"
        datos["requisitos"].append(falso_activo)
        errores = self._ejecutar_con_mutacion(datos)
        self.assertTrue(
            any("RF-012" in e and "no puede figurar como activo" in e for e in errores),
            errores,
        )

    def test_detecta_archivo_de_implementacion_o_evidencia_inexistente(self) -> None:
        datos = copy.deepcopy(self.datos_base)
        datos["requisitos"][0]["implementacion"].append("apps/backend/no_existe_aud19.py")
        datos["requisitos"][0]["evidencia_automatizada"].append(
            {
                "archivo": "apps/backend/tests/test_inexistente_aud19.py",
                "simbolo": "NoExisteTests",
                "nivel": "unit",
            }
        )
        errores = self._ejecutar_con_mutacion(datos)
        self.assertTrue(
            any("Ruta de 'implementacion' inexistente" in e for e in errores),
            errores,
        )
        self.assertTrue(
            any("Archivo de evidencia inexistente" in e for e in errores),
            errores,
        )

    def test_detecta_simbolo_inexistente_en_python_y_mjs(self) -> None:
        datos = copy.deepcopy(self.datos_base)
        datos["requisitos"][0]["evidencia_automatizada"].append(
            {
                "archivo": "apps/backend/config/tests/test_health.py",
                "simbolo": "ClaseInexistenteAUD19Tests",
                "nivel": "api",
            }
        )
        datos["requisitos"][0]["evidencia_automatizada"].append(
            {
                "archivo": "apps/frontend/scripts/check-catalogo-formulario.mjs",
                "simbolo": "funcionInexistenteAud19",
                "nivel": "frontend",
            }
        )
        errores = self._ejecutar_con_mutacion(datos)
        self.assertTrue(
            any("ClaseInexistenteAUD19Tests" in e for e in errores),
            errores,
        )
        self.assertTrue(
            any("funcionInexistenteAud19" in e for e in errores),
            errores,
        )

    def test_detecta_automated_sin_evidencia(self) -> None:
        datos = copy.deepcopy(self.datos_base)
        for req in datos["requisitos"]:
            if req["estado_cobertura"] == "AUTOMATED":
                req["evidencia_automatizada"] = []
                break
        errores = self._ejecutar_con_mutacion(datos)
        self.assertTrue(
            any(
                "Estado AUTOMATED requiere al menos una entrada en 'evidencia_automatizada'" in e
                for e in errores
            ),
            errores,
        )

    def test_detecta_partial_sin_observaciones(self) -> None:
        datos = copy.deepcopy(self.datos_base)
        for req in datos["requisitos"]:
            if req["estado_cobertura"] == "PARTIAL":
                req["observaciones"] = "   "
                break
        errores = self._ejecutar_con_mutacion(datos)
        self.assertTrue(
            any("Estado PARTIAL requiere 'observaciones' no vacías" in e for e in errores),
            errores,
        )

    def test_detecta_deferred_sin_pendiente_en_o_sin_observaciones(self) -> None:
        datos = copy.deepcopy(self.datos_base)
        for req in datos["requisitos"]:
            if req["estado_cobertura"] == "DEFERRED":
                req["pendiente_en"] = []
                req["observaciones"] = ""
                break
        errores = self._ejecutar_con_mutacion(datos)
        self.assertTrue(
            any(
                "Estado DEFERRED requiere al menos un ticket en 'pendiente_en'" in e
                for e in errores
            ),
            errores,
        )
        self.assertTrue(
            any("Estado DEFERRED requiere 'observaciones' no vacías" in e for e in errores),
            errores,
        )

    def test_detecta_estado_cobertura_invalido(self) -> None:
        datos = copy.deepcopy(self.datos_base)
        datos["requisitos"][0]["estado_cobertura"] = "CUMPLIDO_TOTAL"
        errores = self._ejecutar_con_mutacion(datos)
        self.assertTrue(
            any("'estado_cobertura' inválido" in e for e in errores),
            errores,
        )

    def test_prohibe_archivos_demo_como_evidencia_real(self) -> None:
        datos = copy.deepcopy(self.datos_base)
        datos["requisitos"][0]["evidencia_automatizada"].append(
            {
                "archivo": "apps/frontend/scripts/check-demo.mjs",
                "simbolo": "VITE_CATALOGO_API",
                "nivel": "frontend",
            }
        )
        errores = self._ejecutar_con_mutacion(datos)
        self.assertTrue(
            any("DEMO_ONLY" in e and "check-demo.mjs" in e for e in errores),
            errores,
        )

    def _requisito(self, datos: dict, req_id: str) -> dict:
        return next(r for r in datos["requisitos"] if r["id"] == req_id)

    def test_detecta_ticket_pendiente_fuera_del_roadmap(self) -> None:
        datos = copy.deepcopy(self.datos_base)
        self._requisito(datos, "RF-001")["pendiente_en"] = ["AUD-99"]
        datos["foco_aud19"][0]["ticket_posterior"] = "AUD-98"
        errores = self._ejecutar_con_mutacion(datos)
        self.assertTrue(
            any("[RF-001]" in e and "AUD-99" in e and "roadmap_auditorias" in e for e in errores),
            errores,
        )
        self.assertTrue(
            any("ticket_posterior" in e and "AUD-98" in e for e in errores),
            errores,
        )

    def test_detecta_rnf_derivado_a_ticket_que_no_lo_declara(self) -> None:
        datos = copy.deepcopy(self.datos_base)
        self._requisito(datos, "RNF-003")["pendiente_en"] = ["AUD-25"]
        errores = self._ejecutar_con_mutacion(datos)
        self.assertTrue(
            any("[RNF-003]" in e and "AUD-25" in e and "no declara" in e for e in errores),
            errores,
        )

    def test_detecta_roadmap_desalineado_con_backlog_de_auditoria(self) -> None:
        datos = copy.deepcopy(self.datos_base)
        datos["roadmap_auditorias"]["tickets"]["AUD-25"]["requisitos"].append("RNF-003")
        errores = self._ejecutar_con_mutacion(datos)
        self.assertTrue(
            any("roadmap_auditorias[AUD-25]" in e and "no coinciden" in e for e in errores),
            errores,
        )

    def test_extrae_rnf_abreviados_del_backlog(self) -> None:
        backlog = checker.extraer_backlog_auditoria(
            REPO_ROOT / self.datos_base["roadmap_auditorias"]["fuente"]
        )
        self.assertEqual(backlog["AUD-24"]["requisitos"], {"RNF-004", "RNF-006", "RNF-012"})
        self.assertEqual(backlog["AUD-23"]["requisitos"], {"RNF-003", "RNF-007"})

    def test_detecta_desincronizacion_con_markdown(self) -> None:
        md_corrupto = self.md_base.replace(
            "| `accounts / talleres` | `AUTOMATED` |",
            "| `accounts / talleres` | `DEFERRED` |",
        )
        errores = self._ejecutar_con_mutacion(self.datos_base, md_texto=md_corrupto)
        self.assertTrue(
            any("Desincronización JSON/MD en RF-004" in e for e in errores),
            errores,
        )
