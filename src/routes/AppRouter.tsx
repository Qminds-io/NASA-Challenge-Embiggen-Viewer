import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Map from "../components/Map";
import SolarSystem from "../components/SolarSystem";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SolarSystem />} />
        <Route path="/map" element={<Map />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
