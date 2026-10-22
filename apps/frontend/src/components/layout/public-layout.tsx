import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { AvisoPersistencia } from "@/components/layout/demo-controls";

export function PublicLayout({ children }: { children: ReactNode }) {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    const scrollToHash = () => {
      const element = document.getElementById(id);
      if (element) {
        const reduceMotion =
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      }
    };
    const timer = window.setTimeout(scrollToHash, 50);
    return () => window.clearTimeout(timer);
  }, [pathname, hash]);

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <AvisoPersistencia />
      <main id="contenido" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
