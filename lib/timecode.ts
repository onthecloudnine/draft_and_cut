export function secondsToFrame(seconds: number, fps: number) {
  return Math.round(seconds * fps);
}

export function frameToSeconds(frame: number, fps: number) {
  return frame / fps;
}

export function secondsToTimecode(seconds: number, fps: number): string {
  const totalFrames = Math.round(seconds * fps);
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}
