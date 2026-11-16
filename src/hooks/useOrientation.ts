import { useEffect, useState } from 'react';
import {
  OrientationManager,
  type ViewportOrientationState,
} from '../game/input/OrientationManager';

export function useOrientation(): ViewportOrientationState {
  const [state, setState] = useState<ViewportOrientationState>(() =>
    OrientationManager.getState(),
  );

  useEffect(() => {
    setState(OrientationManager.getState());
    return OrientationManager.subscribe(setState);
  }, []);

  return state;
}
