export type MarketTarget = "apps-in-toss" | "google-play" | "app-store";

export type TelemetryParam = string | number | boolean | null | undefined;
export type TelemetryParams = Record<string, TelemetryParam>;
export type CompactTelemetryParams = Record<string, string | number | boolean>;

export type TelemetryClient = {
  screen(name: string, params?: TelemetryParams): void;
  impression(name: string, params?: TelemetryParams): void;
  click(name: string, params?: TelemetryParams): void;
};

export function compactTelemetryParams(
  params: TelemetryParams = {},
): CompactTelemetryParams {
  return Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, string | number | boolean] => entry[1] != null,
    ),
  );
}
