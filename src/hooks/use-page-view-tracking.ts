import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "@/services/telemetry-service";

/**
 * Reports a page_view on every client-side route change. Firebase's automatic
 * collection only fires on a full document load, so a single-page app has to send
 * these itself or every route after the first is invisible in GA4.
 */
export function usePageViewTracking(): void {
  const location = useLocation();

  useEffect(() => {
    trackPageView(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);
}
