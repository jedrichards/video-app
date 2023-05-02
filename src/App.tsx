import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./App.module.css";
import buttonStyles from "./Button.module.css";
import { Button } from "./Button";
import { useKey } from "./useKey";
import useResizeObserver from "@react-hook/resize-observer";
import useEvent from "@react-hook/event";
import interact from "interactjs";
// @ts-expect-error untyped module
import { CSVLink } from "react-csv";
import { createFFmpeg } from "@ffmpeg/ffmpeg";

type Box = { x: number; y: number; width: number; height: number };
type Coords = { x1: number; y1: number; x2: number; y2: number };
type Entries = { frame: number; coords: Coords; id: string }[];

const ffmpeg = createFFmpeg({
  mainName: "main",
  corePath: "https://unpkg.com/@ffmpeg/core-st@latest/dist/ffmpeg-core.js",
});

function App() {
  const [entries, setEntries] = useState<Entries>([]);
  const [file, setFile] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoName, setVideoName] = useState("");
  const [fps, setFPS] = useState<number | null>(null);
  const [videoNativeSize, setVideoNativeSize] = useState<[number, number]>([
    0, 0,
  ]);
  const [canvasRect, setCanvasRect] = useState<Box>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [boxRect, setBoxRect] = useState<Box>({
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });

  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const canvasWrapper = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const frame = typeof fps === "number" ? Math.round(currentTime * fps) : 1;

  const coords: Coords = useMemo(() => {
    const scaleFactor = canvasRect.width / videoNativeSize[0];
    const x1 = Math.round(
      clamp(
        (boxRect.x - canvasRect.x) / scaleFactor,
        0,
        canvasRect.width / scaleFactor
      )
    );
    const y1 = Math.round(
      clamp(
        (boxRect.y - canvasRect.y) / scaleFactor,
        0,
        canvasRect.height / scaleFactor
      )
    );

    const x2 = Math.round(
      clamp(x1 + boxRect.width / scaleFactor, 0, canvasRect.width / scaleFactor)
    );
    const y2 = Math.round(
      clamp(
        y1 + boxRect.height / scaleFactor,
        0,
        canvasRect.height / scaleFactor
      )
    );
    return { x1, y1, x2, y2 };
  }, [boxRect, videoNativeSize, canvasRect]);

  const csvData = [
    ["frame", "top_left_x", "top_left_y", "bottom_right_x", "bottom_right_y"],
    ...entries.map((entry) => {
      return [
        entry.frame,
        entry.coords.x1,
        entry.coords.y1,
        entry.coords.x2,
        entry.coords.y2,
      ];
    }),
  ];

  async function nextFrame() {
    if (fps === null) return;
    video.current!.currentTime = video.current!.currentTime + 1 / fps;
  }

  async function previousFrame() {
    if (fps === null) return;
    video.current!.currentTime = video.current!.currentTime - 1 / fps;
  }

  function playPause() {
    if (video.current?.paused) {
      video.current?.play();
    } else {
      video.current?.pause();
    }
  }

  function promptFPS() {
    const value = Number(window.prompt("FPS", "30")) || 0;
    setFPS(value);
  }

  function log() {
    const currentFrame = frame || 0;
    setEntries((prev) => [
      ...prev,
      { frame: currentFrame, coords, id: crypto.randomUUID() },
    ]);
  }

  function removeEntry(id: string) {
    setEntries((prev) => {
      return prev.filter((entry) => entry.id !== id);
    });
  }

  function seek(frameNumber: number) {
    if (!video.current) return;
    // Not perfectly frame accurate
    video.current.currentTime = frameNumber / (fps || 0);
  }

  function tick(
    now: DOMHighResTimeStamp,
    metadata: VideoFrameCallbackMetadata
  ) {
    if (!canvas.current || !video.current) return;

    const ctx = canvas.current.getContext("2d");
    canvas.current.width = video.current.videoWidth;
    canvas.current.height = video.current.videoHeight;
    ctx?.drawImage(
      video.current,
      0,
      0,
      canvas.current.width,
      canvas.current.height
    );

    setCurrentTime(metadata.mediaTime);

    video.current?.requestVideoFrameCallback?.(tick);
  }

  useKey("KeyQ", () => previousFrame());
  useKey("KeyW", () => nextFrame());
  useKey("KeyE", () => log());
  useKey("KeyF", () => promptFPS());
  useKey("Space", () => playPause());

  useResizeObserver(box.current, (entry) =>
    setBoxRect((prev) => ({
      ...prev,
      width: entry.contentRect.width,
      height: entry.contentRect.height,
    }))
  );

  useResizeObserver(canvas.current, (entry) => {
    const boundingRect = entry.target?.getBoundingClientRect();
    setCanvasRect((prev) => ({
      ...prev,
      x: boundingRect.x,
      y: boundingRect.y,
      width: boundingRect.width,
      height: boundingRect.height,
    }));
  });

  useEvent(window, "resize", () => {
    const boundingRect = canvas.current?.getBoundingClientRect();
    setCanvasRect((prev) => ({
      ...prev,
      x: boundingRect?.x || 0,
      y: boundingRect?.y || 0,
      width: boundingRect?.width || 0,
      height: boundingRect?.height || 0,
    }));
  });

  // Init
  useEffect(() => {
    if (!file || fps === null) return;

    interact(box.current!)
      .draggable({
        listeners: {
          move(event) {
            setBoxRect((prev) => ({
              ...prev,
              x: prev.x + event.dx,
              y: prev.y + event.dy,
            }));
          },
        },
      })
      .resizable({
        listeners: {
          move() {
            setBoxRect((prev) => prev);
          },
        },
      });

    video.current?.requestVideoFrameCallback?.(tick);
  }, [file, fps]);

  useEffect(() => {
    async function probeFPS() {
      if (!file || !videoName) return;

      ffmpeg.setLogger((params) => {
        const match = params.message.match(/(\d+.)?(\d+) fps/);
        if (match && match[0]) {
          const fpsString = match[0];
          const maybeFps = Number(fpsString.replace(" fps", ""));
          if (!isNaN(maybeFps)) setFPS(maybeFps);
        }
      });

      const res = await fetch(file);
      const buffer = await res.arrayBuffer();
      await ffmpeg.load();
      ffmpeg.FS("writeFile", videoName, new Uint8Array(buffer));
      await ffmpeg.run("-i", videoName);
      ffmpeg.FS("unlink", videoName);
    }

    probeFPS();
  }, [file, videoName]);

  return (
    <div className={styles.app}>
      {!file && (
        <div className={styles.input}>
          <input
            title="Select video"
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              if (!file) return;
              setFile(URL.createObjectURL(file));
              setVideoName(file.name);
            }}
          />
        </div>
      )}

      {file && fps === null && (
        <div className={styles.fps}>
          <div>Probing fps...</div>
          <div>
            <a onClick={() => promptFPS()}>Click here to set manually</a>
          </div>
        </div>
      )}

      {file && fps && (
        <div className={styles.editor}>
          <div className={styles.canvasWrapper} ref={canvasWrapper}>
            <canvas className={styles.canvas} ref={canvas} />
            <div
              className={styles.box}
              ref={box}
              style={{
                left: boxRect.x,
                top: boxRect.y,
                width: boxRect.width,
                height: boxRect.height,
              }}
            />
          </div>
          <div className={styles.sidebar}>
            <video
              className={styles.video}
              controls
              muted
              src={file}
              ref={video}
              onFocus={(e) => {
                // Disable keyboard shortcuts on video element
                e.currentTarget.blur();
              }}
              onLoadedMetadata={(e) => {
                setDuration(e.currentTarget.duration);
                setVideoNativeSize([
                  e.currentTarget.videoWidth,
                  e.currentTarget.videoHeight,
                ]);
              }}
            />
            <div className={styles.buttonsAndInfo}>
              <Button onClick={() => previousFrame()}>Prev frame (q)</Button>
              <Button onClick={() => nextFrame()}>Next frame (w)</Button>
              <Button onClick={() => log()}>Log entry (e)</Button>
              <Button onClick={() => promptFPS()}>Set FPS (f)</Button>
              <Button onClick={() => playPause()}>Play/Pause (space)</Button>
              <CSVLink
                data={csvData}
                className={buttonStyles.button}
                filename={`${videoName}.csv`}
              >
                Download CSV
              </CSVLink>
              <div className={styles.info}>
                Dimensions {videoNativeSize[0]}x{videoNativeSize[1]}
              </div>
              <div className={styles.info}>Duration {duration.toFixed(4)}s</div>
              <div className={styles.info}>Current time {currentTime}s</div>
              {typeof fps === "number" && (
                <div className={styles.info}>FPS {fps.toFixed(4)}s</div>
              )}
              {typeof frame === "number" ? (
                <div className={styles.info}>Frame {frame - 1}</div>
              ) : null}
              <div className={styles.info}>Box {printCoords(coords)}</div>
            </div>
            <div className={styles.entries}>
              {entries.map((entry) => (
                <div
                  key={`${entry.frame}-${printCoords(entry.coords)}`}
                  className={styles.entry}
                  onClick={() => seek(entry.frame)}
                >
                  F{entry.frame} [{printCoords(entry.coords)}]{" "}
                  <a
                    className={styles.trashButton}
                    onClick={(e) => {
                      removeEntry(entry.id);
                      e.stopPropagation();
                    }}
                  >
                    ❌
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function printCoords(coords: Coords) {
  return [coords.x1, coords.y1, coords.x2, coords.y2].join(",");
}
