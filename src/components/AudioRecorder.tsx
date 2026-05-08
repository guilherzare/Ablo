import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writeFile } from "@tauri-apps/plugin-fs";
import { join, tempDir } from "@tauri-apps/api/path";
import "./AudioRecorder.css";

type RecorderState = "idle" | "recording" | "paused" | "transcribing" | "done" | "error";

interface TranscriptionEvent {
  type: "progress" | "segment" | "complete" | "error";
  status?: string;
  message?: string;
  text?: string;
}

interface Props {
  onTranscriptionComplete: (text: string) => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function AudioRecorder({ onTranscriptionComplete }: Props) {
  const [state, setState] = useState<RecorderState>("idle");
  const [duration, setDuration] = useState(0);
  const [level, setLevel] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [partialText, setPartialText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Indicateur de niveau micro
  const animateLevel = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteTimeDomainData(data);
    const max = Math.max(...data.map((v) => Math.abs(v - 128)));
    setLevel(Math.min(max / 128, 1));
    animFrameRef.current = requestAnimationFrame(animateLevel);
  }, []);

  // Nettoyage
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current ?? undefined);
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Écoute les événements de transcription
  useEffect(() => {
    const unlisten = listen<TranscriptionEvent>("transcription-progress", (event) => {
      const data = event.payload;
      if (data.type === "progress") {
        setStatusMsg(data.message ?? "Transcription…");
      } else if (data.type === "segment" && data.text) {
        setPartialText((prev) => (prev ? prev + " " + data.text : data.text!));
      } else if (data.type === "complete" && data.text !== undefined) {
        setState("done");
        onTranscriptionComplete(data.text);
      } else if (data.type === "error") {
        setState("error");
        setErrorMsg(data.message ?? "Erreur inconnue");
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [onTranscriptionComplete]);

  async function startRecording() {
    setErrorMsg("");
    setPartialText("");
    chunksRef.current = [];
    setDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Analyseur de niveau
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      animFrameRef.current = requestAnimationFrame(animateLevel);

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(100);
      setState("recording");

      // Chronomètre
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch (e) {
      setErrorMsg("Impossible d'accéder au microphone. Vérifiez les permissions.");
      setState("error");
    }
  }

  function pauseRecording() {
    mediaRecorderRef.current?.pause();
    clearInterval(timerRef.current ?? undefined);
    cancelAnimationFrame(animFrameRef.current);
    setLevel(0);
    setState("paused");
  }

  function resumeRecording() {
    mediaRecorderRef.current?.resume();
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    animFrameRef.current = requestAnimationFrame(animateLevel);
    setState("recording");
  }

  async function stopAndTranscribe() {
    clearInterval(timerRef.current ?? undefined);
    cancelAnimationFrame(animFrameRef.current);
    setLevel(0);

    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    // Attend que le dernier chunk soit disponible
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    streamRef.current?.getTracks().forEach((t) => t.stop());
    setState("transcribing");
    setStatusMsg("Préparation du fichier audio…");

    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      const tmp = await tempDir();
      const audioPath = await join(tmp, "oralis_recording.webm");
      await writeFile(audioPath, bytes);

      setStatusMsg("Chargement du modèle de transcription…");
      await invoke("start_transcription", { audioPath });
    } catch (e) {
      setState("error");
      setErrorMsg(String(e));
    }
  }

  function reset() {
    setState("idle");
    setDuration(0);
    setLevel(0);
    setPartialText("");
    setStatusMsg("");
    setErrorMsg("");
    chunksRef.current = [];
  }

  return (
    <div className="recorder">
      {/* Indicateur de niveau */}
      {(state === "recording" || state === "paused") && (
        <div className="level-bar">
          <div className="level-fill" style={{ width: `${level * 100}%` }} />
        </div>
      )}

      {/* Chronomètre */}
      {(state === "recording" || state === "paused") && (
        <p className="duration">
          {state === "paused" ? "⏸ " : "🔴 "}
          {formatDuration(duration)}
        </p>
      )}

      {/* Message de statut transcription */}
      {state === "transcribing" && (
        <div className="transcribing-status">
          <div className="spinner" />
          <p>{statusMsg}</p>
          {partialText && <p className="partial-text">{partialText}</p>}
        </div>
      )}

      {/* Erreur */}
      {state === "error" && (
        <p className="recorder-error">❌ {errorMsg}</p>
      )}

      {/* Boutons */}
      <div className="recorder-actions">
        {state === "idle" && (
          <button className="btn-record" onClick={startRecording}>
            ● Enregistrer
          </button>
        )}
        {state === "recording" && (
          <>
            <button className="btn-secondary" onClick={pauseRecording}>⏸ Pause</button>
            <button className="btn-primary" onClick={stopAndTranscribe}>⏹ Arrêter et transcrire</button>
          </>
        )}
        {state === "paused" && (
          <>
            <button className="btn-record" onClick={resumeRecording}>● Reprendre</button>
            <button className="btn-primary" onClick={stopAndTranscribe}>⏹ Arrêter et transcrire</button>
          </>
        )}
        {(state === "error" || state === "done") && (
          <button className="btn-secondary" onClick={reset}>↩ Recommencer</button>
        )}
      </div>
    </div>
  );
}
