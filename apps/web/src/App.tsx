import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ServerQuerySync } from "./components/ServerQuerySync";
import { DashboardPage } from "./pages/Dashboard";
import { SettingsPage } from "./pages/Settings";
import { UsersPage } from "./pages/Users";

export default function App() {
  return (
    <BrowserRouter>
      <ServerQuerySync />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
