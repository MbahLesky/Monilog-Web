import type { AnalyticsEventName, AnalyticsEventParams } from "@/lib/analytics-events";

export function initializeAnalytics(): void {
  // Client-side analytics initialization (Vercel Analytics handles page views automatically)
}

export function identifyUser(userId: string | null): void {
  void userId;
}

export function trackEvent(
  name: AnalyticsEventName,
  params?: AnalyticsEventParams | Record<string, unknown>
): void {
  if (import.meta.env.DEV) {
    console.debug(`[Telemetry: ${name}]`, params ?? {});
  }
}

export function trackPageView(path: string): void {
  if (import.meta.env.DEV) {
    console.debug(`[Telemetry: PageView]`, path);
  }
}
