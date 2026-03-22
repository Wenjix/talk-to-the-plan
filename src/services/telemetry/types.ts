export type TelemetryEventName =
  | 'voice_turn_started'
  | 'voice_turn_completed'
  | 'voice_turn_failed'
  | 'typed_turn_submitted'
  | 'tts_playback_started'
  | 'tts_playback_completed'
  | 'tts_playback_failed'
  | 'tts_replay_clicked'
  | 'edit_approved'
  | 'edit_dismissed'
  | 'edits_applied'
  | 'modal_opened'
  | 'modal_closed'
  | 'session_turn_count';

export interface TelemetryEvent {
  name: TelemetryEventName;
  properties: Record<string, string | number | boolean>;
  timestamp: string; // ISO 8601
}
