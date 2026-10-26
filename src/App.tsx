import { BrowserRouter, Routes, Route } from "react-router-dom";
import EngineTwinLanding from "./EngineTwinLanding";
import LiveCameraPage from "./LiveCameraPage";

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<EngineTwinLanding />} />
                <Route path="/dashboard" element={<EngineTwinLanding autoScrollToDashboard />} />
                <Route path="/camera" element={<LiveCameraPage />} />
                <Route path="/live-camera" element={<LiveCameraPage />} />
                <Route path="/analysis" element={<LiveCameraPage />} />
            </Routes>
        </BrowserRouter>
    );
}