import { BrowserRouter, Routes, Route } from "react-router-dom";
import EngineTwinLanding from "./EngineTwinLanding";
import LiveCameraPage from "./LiveCameraPage";
import PastThreatEventsPage from "./PastThreatEventsPage";

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<EngineTwinLanding />} />
                <Route path="/dashboard" element={<EngineTwinLanding autoScrollToDashboard />} />
                <Route path="/camera" element={<LiveCameraPage />} />
                <Route path="/live-camera" element={<LiveCameraPage />} />
                <Route path="/analysis" element={<LiveCameraPage />} />
                <Route path="/threats" element={<PastThreatEventsPage />} />
                <Route path="/past-threats" element={<PastThreatEventsPage />} />
            </Routes>
        </BrowserRouter>
    );
}