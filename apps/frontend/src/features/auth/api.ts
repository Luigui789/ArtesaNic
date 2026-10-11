/**
 * Identidad de la sesión simulada. Al conectar `/api/v1/auth/`, la persona y su
 * taller saldrán de `GET /auth/perfil/` y estas constantes desaparecerán; el
 * compilador señalará entonces cada lugar que todavía dependa de ellas.
 */
export { DEMO_ARTISAN_ID, DEMO_ARTISAN_RESPONSABLE, DEMO_USER_ID } from "@/mocks/core";
