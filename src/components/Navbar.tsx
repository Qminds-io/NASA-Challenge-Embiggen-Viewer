import type { MutableRefObject } from "react";
import { Link } from "react-router-dom";

type LayerOption = { id: string; title: string };
type Coord = { lon: number; lat: number } | null;
type DrawMode = "None" | "Point" | "Polygon";

type Props = {
  headerRef: MutableRefObject<HTMLElement | null>;
  tilePending: number;

  layerId: string;
  layers: LayerOption[];
  onChangeLayer: (id: string) => void;

  date: string;
  onChangeDate: (v: string) => void;

  drawMode: DrawMode;
  onSetDrawMode: (m: DrawMode) => void;

  isModifyOn: boolean;          // kept for compatibility, no longer used
  onToggleModify: () => void;   // kept for compatibility, no longer used
  onDeleteSelected: () => void;

  opacity: number;
  onOpacityChange: (v: number) => void;

  onExport: () => void;
  onImport: (file: File) => void; // kept for compatibility, no longer used

  onResetView: () => void;
  cursorCoord: Coord;
};

export default function Navbar({
  headerRef,
  tilePending,
  layerId,
  layers,
  onChangeLayer,
  date,
  onChangeDate,
  drawMode,
  onSetDrawMode,
  // isModifyOn,              // not used
  // onToggleModify,          // not used
  onDeleteSelected,
  opacity,
  onOpacityChange,
  onExport,
  // onImport,                // not used
  onResetView,
  cursorCoord,
}: Props) {
  return (
    <header
      ref={headerRef}
      className="fixed top-0 inset-x-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur shadow"
    >
      <div className="max-w-7xl mx-auto px-4">
        {/* Multi-row with wrap to avoid horizontal scroll */}
        <div className="py-2 flex flex-wrap items-center gap-x-2 gap-y-2">
          {/* Branding (click to go home) */}
          <Link to="/" className="flex items-center gap-2 pr-2 group" title="Go to the homepage">
            <span className="inline-block w-3 h-3 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-500 shadow-[0_0_0_4px_rgba(14,165,233,0.18)]" />
            <span className="font-extrabold text-slate-900 text-sm sm:text-base group-hover:underline">
              Quantic View
            </span>
          </Link>

          {/* Layer */}
          <div className="h-6 w-px bg-slate-200/90 mx-1" />
          <label className="text-xs font-semibold text-slate-600">Layer</label>
          <select
            value={layerId}
            onChange={(e) => onChangeLayer(e.target.value)}
            className="px-2.5 py-1.5 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
            title="Base layer"
          >
            {layers.map((l) => (
              <option key={l.id} value={l.id}>{l.title}</option>
            ))}
          </select>

          {/* Date */}
          <div className="h-6 w-px bg-slate-200/90 mx-1" />
          <label className="text-xs font-semibold text-slate-600">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => onChangeDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
            title="Date (YYYY-MM-DD)"
          />

          {/* Notes */}
          <div className="h-6 w-px bg-slate-200/90 mx-1" />
          <label className="text-xs font-semibold text-slate-600">Notes</label>
          <div className="inline-flex rounded-md overflow-hidden border border-slate-300 bg-white">
            <button
              onClick={() => onSetDrawMode("Point")}
              title="Point (P)"
              className={`px-3 py-1.5 text-sm ${drawMode === "Point" ? "bg-sky-100 border-r border-slate-300" : "border-r border-slate-300 hover:bg-slate-50"}`}
            >Point</button>
            <button
              onClick={() => onSetDrawMode("Polygon")}
              title="Polygon (G)"
              className={`px-3 py-1.5 text-sm ${drawMode === "Polygon" ? "bg-sky-100 border-r border-slate-300" : "border-r border-slate-300 hover:bg-slate-50"}`}
            >Polygon</button>
            <button
              onClick={() => onSetDrawMode("None")}
              title="None (N)"
              className={`px-3 py-1.5 text-sm ${drawMode === "None" ? "bg-sky-100" : "hover:bg-slate-50"}`}
            >Cursor</button>
          </div>

          {/* Delete only (Edit removed) */}
          <div className="h-6 w-px bg-slate-200/90 mx-1" />
          <button
            onClick={onDeleteSelected}
            title="Delete selection (Del)"
            className="px-3 py-1.5 text-sm rounded-md border border-rose-300 bg-rose-100 hover:bg-rose-200"
          >
            Delete
          </button>

          {/* Opacity */}
          <div className="h-6 w-px bg-slate-200/90 mx-1" />
          <label className="text-xs font-semibold text-slate-600">Opacity</label>
          <input
            type="range" min={0} max={1} step={0.05}
            value={opacity}
            onChange={(e) => onOpacityChange(Number(e.target.value))}
            className="w-28" title="Layer opacity"
          />

          {/* Export (Import removed) */}
          <div className="h-6 w-px bg-slate-200/90 mx-1" />
          <button
            onClick={onExport}
            className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50"
            title="Export GeoJSON"
          >
            Export
          </button>

          {/* Spacer */}
          <div className="grow" />

          {/* Refocus + coordinates */}
          <div className="flex items-center gap-3">
            <button
              onClick={onResetView}
              className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50"
              title="Refocus (R)"
            >Refocus</button>
            <div className="text-[11px] text-slate-500">
              {cursorCoord ? `Cursor: ${cursorCoord.lon.toFixed(4)}, ${cursorCoord.lat.toFixed(4)}` : "Cursor: --"}
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar under the navbar */}
      <div className={`h-[3px] bg-gradient-to-r from-sky-400 via-sky-500 to-sky-400 transition-all duration-150 ${tilePending > 0 ? "opacity-100" : "opacity-0"}`} />
    </header>
  );
}
