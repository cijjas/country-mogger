import { Composition } from "remotion";
import { Demo, DEMO_DURATION, DEMO_FPS } from "./Demo";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Demo"
    component={Demo}
    durationInFrames={DEMO_DURATION}
    fps={DEMO_FPS}
    width={1280}
    height={720}
  />
);
