"use client";

import { useRef, useState, type PointerEvent } from "react";

type Props = {
  onChange: (value: string) => void;
  typedName: string;
  error?: string;
  lang: "en" | "zh";
};

export function WaiverSignaturePad({ onChange, typedName, error, lang }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * event.currentTarget.width,
      y: ((event.clientY - rect.top) / rect.height) * event.currentTarget.height,
    };
  }

  function begin(event: PointerEvent<HTMLCanvasElement>) {
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const next = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111827";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(next.x, next.y);
    context.lineTo(next.x + 0.1, next.y + 0.1);
    context.stroke();
    setDrawing(true);
    onChange(event.currentTarget.toDataURL("image/png"));
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const next = point(event);
    context.lineTo(next.x, next.y);
    context.stroke();
    onChange(event.currentTarget.toDataURL("image/png"));
  }

  function end() {
    setDrawing(false);
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  function generateFromTypedName() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const name = typedName.trim();
    if (!canvas || !context || !name) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(28, 122);
    context.rotate(-0.035);
    context.fillStyle = "#111827";
    context.font = "italic 62px cursive";
    context.fillText(name, 0, 0, canvas.width - 56);
    context.restore();
    onChange(canvas.toDataURL("image/png"));
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          {lang === "zh" ? "签名（可选）" : "Signature (optional)"}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={generateFromTypedName}
            disabled={!typedName.trim()}
            className="text-xs font-medium text-snow-700 underline disabled:cursor-not-allowed disabled:text-gray-400"
          >
            {lang === "zh" ? "用姓名生成签名" : "Generate from name"}
          </button>
          <button type="button" onClick={clear} className="text-xs font-medium text-snow-700 underline">
            {lang === "zh" ? "清除" : "Clear"}
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={600}
        height={180}
        onPointerDown={begin}
        onPointerMove={draw}
        onPointerUp={end}
        onPointerCancel={end}
        className="mt-1 h-36 w-full touch-none rounded border border-dashed border-gray-300 bg-white"
        aria-label={lang === "zh" ? "请在此手写签名" : "Sign here by hand"}
      />
      <p className="mt-1 text-xs text-gray-500">
        {lang === "zh" ? "可用鼠标、手指或触控笔直接签名，或先输入全名再生成模拟手写签名。" : "Draw with your mouse, finger, or stylus, or generate a simulated handwritten signature from your typed name."}
      </p>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
