import { useSessionStore } from '../../store/session-store';
import { useVoiceChatStore } from '../../store/voice-chat-store';
import { RadialMenu } from '../RadialMenu/RadialMenu';
import { VoiceChatPanel } from '../VoiceChatPanel/VoiceChatPanel';
import { LaneCanvas } from './LaneCanvas';

export function ParallaxCanvas() {
  const activeLaneId = useSessionStore(s => s.activeLaneId);
  const activePanelNodeId = useVoiceChatStore(s => s.activePanelNodeId);
  const panelPosition = useVoiceChatStore(s => s.panelPosition);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <LaneCanvas laneId={activeLaneId ?? ''} />
      <RadialMenu />
      {activePanelNodeId && <VoiceChatPanel position={panelPosition} />}
    </div>
  );
}
