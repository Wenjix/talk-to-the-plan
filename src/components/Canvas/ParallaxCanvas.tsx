import { useSessionStore } from '../../store/session-store';
import { useVoiceChatStore } from '../../store/voice-chat-store';
import { useCompanionStore } from '../../store/companion-store';
import { RadialMenu } from '../RadialMenu/RadialMenu';
import { VoiceChatPanel } from '../VoiceChatPanel/VoiceChatPanel';
import { TranscriptRibbon } from '../TranscriptRibbon/TranscriptRibbon';
import { LaneCanvas } from './LaneCanvas';

export function ParallaxCanvas() {
  const activeLaneId = useSessionStore(s => s.activeLaneId);
  const activePanelNodeId = useVoiceChatStore(s => s.activePanelNodeId);
  const panelPosition = useVoiceChatStore(s => s.panelPosition);
  const companionStatus = useCompanionStore(s => s.status);
  const showRibbon = companionStatus !== 'off';

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <LaneCanvas laneId={activeLaneId ?? ''} />
      <RadialMenu />
      {activePanelNodeId && <VoiceChatPanel position={panelPosition} />}
      {showRibbon && <TranscriptRibbon />}
    </div>
  );
}
