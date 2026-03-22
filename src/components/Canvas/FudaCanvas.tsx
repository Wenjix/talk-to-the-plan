import { useSessionStore } from '../../store/session-store';
import { RadialMenu } from '../RadialMenu/RadialMenu';
import { LaneCanvas } from './LaneCanvas';

export function FudaCanvas() {
  const activeLaneId = useSessionStore(s => s.activeLaneId);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <LaneCanvas laneId={activeLaneId ?? ''} />
      <RadialMenu />
    </div>
  );
}
