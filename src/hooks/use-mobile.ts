import { useEffect, useState } from "react";

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  const mql = typeof window !== "undefined" ? window.matchMedia(`(max-width: 767px)`) : null;

  useEffect(() => {
    if (!mql) return;
    const onChange = () => setIsMobile(window.innerWidth < 768);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

