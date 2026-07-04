import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { I18nContext, type Lang } from "./i18n";
import { session } from "./api";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import LiveMap from "./pages/LiveMap";
import Drivers from "./pages/Drivers";
import Customers from "./pages/Customers";
import Orders from "./pages/Orders";
import Tariffs from "./pages/Tariffs";
import Withdrawals from "./pages/Withdrawals";
import Notifications from "./pages/Notifications";
import AuditLog from "./pages/AuditLog";

function RequireAdmin({ children }: { children: JSX.Element }) {
  const user = session.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  const [lang, setLang] = useState<Lang>((localStorage.getItem("meshily.lang") as Lang) || "ar");
  const [theme, setTheme] = useState(localStorage.getItem("meshily.theme") || "light");

  useEffect(() => {
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    localStorage.setItem("meshily.lang", lang);
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("meshily.theme", theme);
  }, [theme]);

  return (
    <I18nContext.Provider value={{ lang, setLang }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAdmin>
              <Layout theme={theme} onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")} />
            </RequireAdmin>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="live" element={<LiveMap />} />
          <Route path="drivers" element={<Drivers />} />
          <Route path="customers" element={<Customers />} />
          <Route path="orders" element={<Orders />} />
          <Route path="tariffs" element={<Tariffs />} />
          <Route path="withdrawals" element={<Withdrawals />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="audit" element={<AuditLog />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </I18nContext.Provider>
  );
}
