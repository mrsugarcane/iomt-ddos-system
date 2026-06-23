import React from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./lib/AuthContext";
import { LiveFeedProvider } from "./lib/LiveFeedContext";

import Login from "./pages/auth/Login";
import Home from "./pages/Home";
import Dataset from "./pages/Dataset";
import ModelComparison from "./pages/ModelComparison";
import LiveMonitor from "./pages/LiveMonitor";
import AlertQueue from "./pages/AlertQueue";
import Explainability from "./pages/Explainability";
import Admin from "./pages/Admin";
import Account from "./pages/Account";
import About from "./pages/About";

export default function App() {
  return (
    <AuthProvider>
      <LiveFeedProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/dataset" element={<Dataset />} />
                    <Route path="/models" element={<ModelComparison />} />
                    <Route path="/explainability" element={<Explainability />} />
                    <Route path="/monitor" element={<LiveMonitor />} />
                    <Route path="/alerts" element={<AlertQueue />} />
                    <Route path="/account" element={<Account />} />
                    <Route
                      path="/admin"
                      element={<ProtectedRoute minRole="admin"><Admin /></ProtectedRoute>}
                    />
                    <Route path="/about" element={<About />} />
                  </Routes>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </LiveFeedProvider>
    </AuthProvider>
  );
}
