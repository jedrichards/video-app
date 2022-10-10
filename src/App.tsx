import {
  ReactEventHandler,
  SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./App.module.css";
import buttonStyles from "./Button.module.css";
import { Button } from "./Button";
import { useKey } from "./useKey";
import useResizeObserver from "@react-hook/resize-observer";
import useEvent from "@react-hook/event";
import interact from "interactjs";
// @ts-expect-error untyped module
import { CSVLink } from "react-csv";

type Box = { x: number; y: number; width: number; height: number };
type Coords = { x1: number; y1: number; x2: number; y2: number };
type Entries = Record<number, Coords>;

function App() {
  const [entries, setEntries] = useState<Entries>({});
  const [file, setFile] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoName, setVideoName] = useState("");
  const [estimatedFPS, setEstimatedFPS] = useState<number | null>(null);
  const [userFPS, setUserFPS] = useState<number | null>(null);
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

  const fps =
    typeof userFPS === "number"
      ? userFPS
      : typeof estimatedFPS === "number"
      ? estimatedFPS
      : null;

  const frame =
    typeof fps === "number"
      ? Math.floor((video.current?.currentTime || 0) * fps)
      : null;

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

  const csvData = Object.keys(entries).map((key) => {
    const frame = Number(key);
    return [
      frame,
      entries[frame].x1,
      entries[frame].y1,
      entries[frame].x2,
      entries[frame].y2,
    ];
  });

  // async function nextFrame() {
  //   const start = video.current?.currentTime || 0;
  //   try {
  //     // @ts-expect-error Firefox only API
  //     await video.current?.seekToNextFrame();
  //   } catch (e) {}
  //   // Hack to update current time after seek
  //   await video.current?.play();
  //   await video.current?.pause();
  //   // Rough estimate FPS
  //   const end = video.current?.currentTime || 0;
  //   setEstimatedFPS(1 / (end - start));
  // }

  async function nextFrame() {
    if (userFPS === null) return;
    video.current!.currentTime = video.current!.currentTime + 1 / userFPS;
    await video.current!.pause();
  }

  async function previousFrame() {
    if (userFPS === null) return;
    video.current!.currentTime = video.current!.currentTime - 1 / userFPS;
    await video.current!.pause();
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
    setUserFPS(value);
  }

  function log() {
    const currentFrame = frame || 0;
    setEntries((prev) => ({ ...prev, [currentFrame]: coords }));
  }

  function updateCanvas() {
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
    requestAnimationFrame(updateCanvas);
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

  useEffect(() => {
    if (!file) return;

    promptFPS();
  }, [file]);

  useEffect(() => {
    if (!file || userFPS === null) return;

    // videoCanvas(video.current, {
    //   canvas: canvas.current,
    // });

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

    requestAnimationFrame(updateCanvas);
  }, [file, userFPS]);

  return (
    <div className={styles.app}>
      {!file && (
        <div className={styles.input}>
          <input
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

      {file && (
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
              autoPlay
              className={styles.video}
              controls
              muted
              src={file}
              ref={video}
              onTimeUpdate={(e) => {
                setCurrentTime(e.currentTarget.currentTime);
              }}
              onFocus={(e) => {
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
              {typeof userFPS === "number" ? (
                <div className={styles.info}>FPS {userFPS.toFixed(4)}s</div>
              ) : typeof estimatedFPS === "number" ? (
                <div className={styles.info}>
                  ⚠️ FPS {estimatedFPS.toFixed(4)}s (estimated)
                </div>
              ) : (
                <div className={styles.info}>⚠️ FPS unknown</div>
              )}
              {typeof frame === "number" ? (
                <div className={styles.info}>Frame {frame}</div>
              ) : null}
              <div className={styles.info}>Box {printCoords(coords)}</div>
            </div>
            <div className={styles.entries}>
              {Object.keys(entries).map((key) => (
                <div key={key} className={styles.entry}>
                  {key},{printCoords(entries[Number(key)])}
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
