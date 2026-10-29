import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Controles marcados como inválidos y secciones sin control propio (ubicación). */
export const SELECTOR_ERROR = '[aria-invalid="true"], [data-error-foco]';

/**
 * Para formularios con errores en estado propio (sin `shouldFocusError` de React Hook
 * Form): tras pedirlo, y ya renderizados los errores, enfoca el primer elemento inválido
 * del contenedor en orden del documento y lo desplaza a la vista.
 */
export function useEnfocarPrimerError(contenedor: RefObject<HTMLElement | null>) {
  const [solicitud, setSolicitud] = useState(0);
  const atendida = useRef(0);

  useEffect(() => {
    if (solicitud === atendida.current) return;
    atendida.current = solicitud;
    const destino = contenedor.current?.querySelector<HTMLElement>(SELECTOR_ERROR);
    if (!destino) return;
    destino.focus({ preventScroll: true });
    const reducir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    destino.scrollIntoView({ block: "center", behavior: reducir ? "auto" : "smooth" });
  }, [solicitud, contenedor]);

  return useCallback(() => setSolicitud((n) => n + 1), []);
}
