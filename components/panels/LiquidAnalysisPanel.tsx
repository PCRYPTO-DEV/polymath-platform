"use client";

import { useState, useRef, useCallback } from "react";
import { ChevronDown, ChevronUp, Upload, Zap, Camera, Loader2 } from "lucide-react";

type Tab = "sar" | "camera";

interface AnalysisResult {
  interpretation: string;
  confidence?: string;
  flags?: string[];
}

// Sample InSAR image descriptions for the three bundled samples
// riskScore/rateMMmo/etc are passed to the analysis engine for context-aware output
const SAR_SAMPLES = [
  {
    id: "nhw8_yamuna_insar",
    label: "NH-8 Yamuna Bridge — InSAR",
    assetName: "NH-8 Yamuna Bridge",
    assetType: "bridge",
    location: "Delhi–Gurugram, Haryana",
    description: "Fringe pattern indicating vertical displacement",
    riskScore: 91,
    riskLevel: "dangerous",
    rateMMmo: -9.4,
    totalMM: -88.2,
    trend: "accelerating",
  },
  {
    id: "dwarka_subsidence_insar",
    label: "Dwarka Sector 23 — Subsidence",
    assetName: "Dwarka Sector 23 Settlement Zone",
    assetType: "building",
    location: "Dwarka, South-West Delhi",
    description: "Bowl-shaped subsidence deformation",
    riskScore: 88,
    riskLevel: "dangerous",
    rateMMmo: -7.1,
    totalMM: -64.3,
    trend: "accelerating",
  },
  {
    id: "aravalli_amplitude",
    label: "Aravalli Ridge — SAR Amplitude",
    assetName: "Aravalli Ridge South Face",
    assetType: "slope",
    location: "Faridabad — Aravalli Hills Southern Scarp",
    description: "Backscatter amplitude for slope monitoring",
    riskScore: 85,
    riskLevel: "dangerous",
    rateMMmo: -11.2,
    totalMM: -102.4,
    trend: "accelerating",
  },
];

const CAMERA_FEEDS = [
  {
    id: "bridge_pier",
    label: "Bridge Pier Cam — NH-8",
    description: "Structural joint monitoring, North pier",
    aiPrompt: "bridge structural monitoring camera showing bridge pier joints and support structure",
  },
  {
    id: "slope_sensor",
    label: "Slope Sensor Cam — Aravalli",
    description: "Rock face displacement sensor, south face",
    aiPrompt: "hillslope rock face monitoring camera with visible cracks and displacement markers",
  },
];

async function fetchAnalysis(
  imageBase64: string,
  assetName: string,
  assetType: string,
  location: string,
  extra?: { riskScore?: number; riskLevel?: string; rateMMmo?: number; totalMM?: number; trend?: string }
): Promise<AnalysisResult> {
  const res = await fetch("/api/analyze-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, assetName, assetType, location, ...extra }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// Generates a mock base64 PNG placeholder (1x1 pixel gray)
function mockImageBase64(): string {
  return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
}

export default function LiquidAnalysisPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("sar");
  const [selectedSample, setSelectedSample] = useState(0);
  const [selectedCamera, setSelectedCamera] = useState(0);
  const [sarResult, setSarResult] = useState<AnalysisResult | null>(null);
  const [cameraResult, setCameraResult] = useState<AnalysisResult | null>(null);
  const [sarLoading, setSarLoading] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [sarError, setSarError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runSarAnalysis = useCallback(async (imageBase64?: string) => {
    const sample = SAR_SAMPLES[selectedSample];
    setSarLoading(true);
    setSarError(null);
    setSarResult(null);
    try {
      const result = await fetchAnalysis(
        imageBase64 ?? mockImageBase64(),
        sample.assetName,
        sample.assetType,
        sample.location,
        {
          riskScore: sample.riskScore,
          riskLevel: sample.riskLevel,
          rateMMmo: sample.rateMMmo,
          totalMM: sample.totalMM,
          trend: sample.trend,
        }
      );
      setSarResult(result);
    } catch (err) {
      setSarError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setSarLoading(false);
    }
  }, [selectedSample]);

  const runCameraAnalysis = useCallback(async () => {
    const feed = CAMERA_FEEDS[selectedCamera];
    setCameraLoading(true);
    setCameraError(null);
    setCameraResult(null);
    try {
      const result = await fetchAnalysis(
        mockImageBase64(),
        feed.aiPrompt,
        "infrastructure_camera",
        "Delhi NCR"
      );
      setCameraResult(result);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setCameraLoading(false);
    }
  }, [selectedCamera]);

  const handleFileDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = (ev.target?.result as string).split(",")[1];
        runSarAnalysis(base64);
      };
      reader.readAsDataURL(file);
    },
    [runSarAnalysis]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = (ev.target?.result as string).split(",")[1];
        runSarAnalysis(base64);
      };
      reader.readAsDataURL(file);
    },
    [runSarAnalysis]
  );

  return (
    <div
      style={{
        position: "absolute",
        bottom: 20,
        right: 400, // sits left of AssetDetailPanel when it's open
        zIndex: 550,
        width: 380,
        background: "#0d1117",
        border: "1px solid #21262d",
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      }}
    >
      {/* Panel header — click to collapse/expand */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          borderBottom: isOpen ? "1px solid #21262d" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Zap size={13} color="#06b6d4" />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#06b6d4", letterSpacing: "0.07em" }}>
            LIQUID AI ANALYSIS
          </span>
          <span
            style={{
              fontSize: 9,
              color: "#484f58",
              background: "#161b22",
              border: "1px solid #21262d",
              borderRadius: 3,
              padding: "1px 5px",
            }}
          >
            LFM2-VL
          </span>
        </div>
        {isOpen ? <ChevronDown size={14} color="#484f58" /> : <ChevronUp size={14} color="#484f58" />}
      </button>

      {isOpen && (
        <div>
          {/* Tab switcher */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid #21262d",
            }}
          >
            {(["sar", "camera"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  fontSize: 11,
                  fontWeight: 500,
                  background: "transparent",
                  border: "none",
                  borderBottom: `2px solid ${activeTab === tab ? "#06b6d4" : "transparent"}`,
                  color: activeTab === tab ? "#06b6d4" : "#484f58",
                  cursor: "pointer",
                  letterSpacing: "0.05em",
                }}
              >
                {tab === "sar" ? "SAR IMAGE" : "DEEP CAMERA"}
              </button>
            ))}
          </div>

          <div style={{ padding: "12px 14px" }}>
            {activeTab === "sar" && (
              <SarTab
                samples={SAR_SAMPLES}
                selectedSample={selectedSample}
                onSelectSample={setSelectedSample}
                onAnalyze={() => runSarAnalysis()}
                onFileDrop={handleFileDrop}
                onFileInput={handleFileInput}
                fileInputRef={fileInputRef}
                loading={sarLoading}
                result={sarResult}
                error={sarError}
              />
            )}
            {activeTab === "camera" && (
              <CameraTab
                feeds={CAMERA_FEEDS}
                selectedFeed={selectedCamera}
                onSelectFeed={setSelectedCamera}
                onAnalyze={runCameraAnalysis}
                loading={cameraLoading}
                result={cameraResult}
                error={cameraError}
              />
            )}
          </div>

          {/* Powered by footer */}
          <div
            style={{
              padding: "8px 14px",
              borderTop: "1px solid #21262d",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 10, color: "#484f58" }}>Powered by Liquid AI LFM2.5-VL-1.6B</span>
            <span style={{ fontSize: 10, color: "#484f58" }}>labs.liquid.ai</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SAR Image Analysis Tab ──────────────────────────────────────────

interface SarTabProps {
  samples: typeof SAR_SAMPLES;
  selectedSample: number;
  onSelectSample: (i: number) => void;
  onAnalyze: () => void;
  onFileDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  loading: boolean;
  result: AnalysisResult | null;
  error: string | null;
}

function SarTab({
  samples,
  selectedSample,
  onSelectSample,
  onAnalyze,
  onFileDrop,
  onFileInput,
  fileInputRef,
  loading,
  result,
  error,
}: SarTabProps) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Sample selector */}
      <div>
        <div style={{ fontSize: 10, color: "#484f58", marginBottom: 6, letterSpacing: "0.06em" }}>
          SELECT SAMPLE IMAGE
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {samples.map((s, i) => (
            <button
              key={s.id}
              onClick={() => onSelectSample(i)}
              style={{
                textAlign: "left",
                background: selectedSample === i ? "rgba(6,182,212,0.08)" : "#161b22",
                border: `1px solid ${selectedSample === i ? "#06b6d4" : "#21262d"}`,
                borderRadius: 5,
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 11, color: selectedSample === i ? "#06b6d4" : "#c9d1d9", fontWeight: 500 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 10, color: "#484f58", marginTop: 1 }}>{s.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Drag-drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { setDragOver(false); onFileDrop(e); }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `1px dashed ${dragOver ? "#06b6d4" : "#30363d"}`,
          borderRadius: 6,
          padding: "10px",
          textAlign: "center",
          cursor: "pointer",
          background: dragOver ? "rgba(6,182,212,0.05)" : "transparent",
          transition: "all 0.15s ease",
        }}
      >
        <Upload size={14} color="#484f58" style={{ margin: "0 auto 4px" }} />
        <div style={{ fontSize: 10, color: "#484f58" }}>Drop custom SAR image or click to upload</div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={onFileInput}
        />
      </div>

      {/* Analyze button */}
      <button
        onClick={onAnalyze}
        disabled={loading}
        style={{
          background: loading ? "#161b22" : "rgba(6,182,212,0.15)",
          border: "1px solid #06b6d4",
          borderRadius: 6,
          padding: "8px 14px",
          color: "#06b6d4",
          fontSize: 12,
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        {loading ? (
          <>
            <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
            LFM Analyzing...
          </>
        ) : (
          <>
            <Zap size={13} />
            Analyze with LFM2-VL
          </>
        )}
      </button>

      <AnalysisOutput result={result} error={error} />
    </div>
  );
}

// ── Deep Camera Tab ──────────────────────────────────────────────────

interface CameraTabProps {
  feeds: typeof CAMERA_FEEDS;
  selectedFeed: number;
  onSelectFeed: (i: number) => void;
  onAnalyze: () => void;
  loading: boolean;
  result: AnalysisResult | null;
  error: string | null;
}

function CameraTab({
  feeds,
  selectedFeed,
  onSelectFeed,
  onAnalyze,
  loading,
  result,
  error,
}: CameraTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 10, color: "#484f58", letterSpacing: "0.06em" }}>
        EDGE CAMERA FEEDS — LEAP SDK
      </div>

      {feeds.map((feed, i) => (
        <button
          key={feed.id}
          onClick={() => onSelectFeed(i)}
          style={{
            textAlign: "left",
            background: selectedFeed === i ? "rgba(6,182,212,0.08)" : "#161b22",
            border: `1px solid ${selectedFeed === i ? "#06b6d4" : "#21262d"}`,
            borderRadius: 5,
            padding: "8px 10px",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <Camera size={11} color={selectedFeed === i ? "#06b6d4" : "#484f58"} />
            <span style={{ fontSize: 11, color: selectedFeed === i ? "#06b6d4" : "#c9d1d9", fontWeight: 500 }}>
              {feed.label}
            </span>
          </div>
          <div style={{ fontSize: 10, color: "#484f58" }}>{feed.description}</div>
        </button>
      ))}

      {/* Simulated camera frame placeholder */}
      <div
        style={{
          background: "#0a0d14",
          border: "1px solid #21262d",
          borderRadius: 6,
          height: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Camera size={24} color="#21262d" />
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 8,
            fontSize: 9,
            color: "#484f58",
            letterSpacing: "0.06em",
          }}
        >
          LIVE · {feeds[selectedFeed].label.split("—")[0].trim()}
        </div>
        <div
          style={{
            position: "absolute",
            top: 6,
            right: 8,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#22c55e",
            animation: "pulse 2s ease infinite",
          }}
        />
        <div style={{ position: "absolute", bottom: 6, left: 8, fontSize: 9, color: "#484f58" }}>
          DeepCamera · SharpAI · LEAP SDK
        </div>
      </div>

      <button
        onClick={onAnalyze}
        disabled={loading}
        style={{
          background: loading ? "#161b22" : "rgba(6,182,212,0.15)",
          border: "1px solid #06b6d4",
          borderRadius: 6,
          padding: "8px 14px",
          color: "#06b6d4",
          fontSize: 12,
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        {loading ? (
          <>
            <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
            Camera AI analyzing...
          </>
        ) : (
          <>
            <Camera size={13} />
            Run Camera AI
          </>
        )}
      </button>

      <AnalysisOutput result={result} error={error} cameraMode />
    </div>
  );
}

// ── Shared Analysis Output ───────────────────────────────────────────

function AnalysisOutput({
  result,
  error,
  cameraMode = false,
}: {
  result: AnalysisResult | null;
  error: string | null;
  cameraMode?: boolean;
}) {
  if (error) {
    return (
      <div
        style={{
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: 6,
          padding: "8px 10px",
          fontSize: 11,
          color: "#ef4444",
        }}
      >
        {error}
      </div>
    );
  }

  if (!result) return null;

  return (
    <div
      style={{
        background: "#161b22",
        border: "1px solid #21262d",
        borderLeft: "3px solid #06b6d4",
        borderRadius: "0 6px 6px 0",
        padding: "10px 12px",
      }}
    >
      <div style={{ fontSize: 10, color: "#484f58", marginBottom: 6, letterSpacing: "0.06em" }}>
        {cameraMode ? "CAMERA AI ASSESSMENT" : "LFM2-VL ASSESSMENT"}
      </div>
      <p style={{ fontSize: 12, color: "#c9d1d9", lineHeight: 1.6, margin: 0 }}>
        {result.interpretation}
      </p>
      {result.confidence && (
        <div style={{ fontSize: 10, color: "#484f58", marginTop: 6 }}>
          Confidence: {result.confidence}
        </div>
      )}
      {result.flags && result.flags.length > 0 && (
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {result.flags.map((flag) => (
            <span
              key={flag}
              style={{
                fontSize: 9,
                color: "#f97316",
                background: "rgba(249,115,22,0.12)",
                border: "1px solid rgba(249,115,22,0.2)",
                borderRadius: 3,
                padding: "1px 5px",
              }}
            >
              {flag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
