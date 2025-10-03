import type { MutableRefObject } from "react";

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

  isModifyOn: boolean;
  onToggleModify: () => void;
  onDeleteSelected: () => void;

  opacity: number;
  onOpacityChange: (v: number) => void;

  onExport: () => void;
  onImport: (file: File) => void;

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
  isModifyOn,
  onToggleModify,
  onDeleteSelected,
  opacity,
  onOpacityChange,
  onExport,
  onImport,
  onResetView,
  cursorCoord,
}: Props) {
  return (
    <header
      ref={headerRef}
      className="fixed top-0 inset-x-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur shadow"
    >
      <div className="max-w-7xl mx-auto px-4">
        {/* MULTI-FILA con wrap: sin scroll horizontal */}
        <div className="py-2 flex flex-wrap items-center gap-x-2 gap-y-2">
          {/* Branding */}
          <div className="flex items-center gap-2 pr-2">
            <span className="inline-block w-3 h-3 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-500 shadow-[0_0_0_4px_rgba(14,165,233,0.18)]" />
            <span className="font-extrabold text-slate-900 text-sm sm:text-base">Embiggen Viewer</span>
          </div>

          {/* Capa */}
          <div className="h-6 w-px bg-slate-200/90 mx-1" />
          <label className="text-xs font-semibold text-slate-600">Capa</label>
          <select
            value={layerId}
            onChange={(e) => onChangeLayer(e.target.value)}
            className="px-2.5 py-1.5 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
            title="Capa base GIBS"
          >
            {layers.map((l) => (
              <option key={l.id} value={l.id}>{l.title}</option>
            ))}
          </select>

          {/* Fecha */}
          <div className="h-6 w-px bg-slate-200/90 mx-1" />
          <label className="text-xs font-semibold text-slate-600">Fecha</label>
          <input
            type="date"
            value={date}
            onChange={(e) => onChangeDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
            title="Fecha (YYYY-MM-DD)"
          />

          {/* Anotar */}
          <div className="h-6 w-px bg-slate-200/90 mx-1" />
          <label className="text-xs font-semibold text-slate-600">Anotar</label>
          <div className="inline-flex rounded-md overflow-hidden border border-slate-300 bg-white">
            <button
              onClick={() => onSetDrawMode("Point")}
              title="Punto (P)"
              className={`px-3 py-1.5 text-sm ${drawMode === "Point" ? "bg-sky-100 border-r border-slate-300" : "border-r border-slate-300 hover:bg-slate-50"}`}
            >Punto</button>
            <button
              onClick={() => onSetDrawMode("Polygon")}
              title="Polígono (G)"
              className={`px-3 py-1.5 text-sm ${drawMode === "Polygon" ? "bg-sky-100 border-r border-slate-300" : "border-r border-slate-300 hover:bg-slate-50"}`}
            >Polígono</button>
            <button
              onClick={() => onSetDrawMode("None")}
              title="Ninguno (N)"
              className={`px-3 py-1.5 text-sm ${drawMode === "None" ? "bg-sky-100" : "hover:bg-slate-50"}`}
            >Ninguno</button>
          </div>

          {/* Editar / Borrar */}
          <div className="h-6 w-px bg-slate-200/90 mx-1" />
          <button
            onClick={onToggleModify}
            title="Editar (E)"
            className={`px-3 py-1.5 text-sm rounded-md border ${isModifyOn ? "border-sky-400 bg-sky-100" : "border-slate-300 bg-white hover:bg-slate-50"}`}
          >
            {isModifyOn ? "Editar: ON" : "Editar: OFF"}
          </button>
          <button
            onClick={onDeleteSelected}
            title="Borrar selección (Del)"
            className="px-3 py-1.5 text-sm rounded-md border border-rose-300 bg-rose-100 hover:bg-rose-200"
          >
            Borrar
          </button>

          {/* Opacidad */}
          <div className="h-6 w-px bg-slate-200/90 mx-1" />
          <label className="text-xs font-semibold text-slate-600">Opacidad</label>
          <input
            type="range" min={0} max={1} step={0.05}
            value={opacity}
            onChange={(e) => onOpacityChange(Number(e.target.value))}
            className="w-28" title="Opacidad de la capa"
          />

          {/* Exportar / Importar */}
          <div className="h-6 w-px bg-slate-200/90 mx-1" />
          <button onClick={onExport} className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50" title="Exportar GeoJSON">Exportar</button>
          <label className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">
            Importar
            <input
              type="file" accept=".geojson,application/geo+json,application/json" className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImport(file);
                (e.currentTarget as HTMLInputElement).value = "";
              }}
            />
          </label>

          {/* Spacer */}
          <div className="grow" />

          {/* Recentrar + coords */}
          <div className="flex items-center gap-3">
            <button
              onClick={onResetView}
              className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50"
              title="Recentrar (R)"
            >Recentrar</button>
            <div className="text-[11px] text-slate-500">
              {cursorCoord ? `Cursor: ${cursorCoord.lon.toFixed(4)}, ${cursorCoord.lat.toFixed(4)}` : "Cursor: —"}
            </div>
          </div>
        </div>
      </div>

      {/* Barra de progreso bajo el navbar */}
      <div className={`h-[3px] bg-gradient-to-r from-sky-400 via-sky-500 to-sky-400 transition-all duration-150 ${tilePending > 0 ? "opacity-100" : "opacity-0"}`} />
    </header>
  );
}
