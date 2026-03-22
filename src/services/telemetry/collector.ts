import type { TelemetryEvent, TelemetryEventName } from './types';

class TelemetryCollector {
  private enabled = false;
  private buffer: TelemetryEvent[] = [];

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  track(name: TelemetryEventName, properties: Record<string, string | number | boolean> = {}): void {
    if (!this.enabled) return;
    this.buffer.push({
      name,
      properties,
      timestamp: new Date().toISOString(),
    });
  }

  flush(): TelemetryEvent[] {
    const events = [...this.buffer];
    this.buffer = [];
    return events;
  }

  get pendingCount(): number {
    return this.buffer.length;
  }
}

export const telemetry = new TelemetryCollector();
