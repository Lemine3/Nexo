import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { session } from "../api";
import { useLang, useT } from "../i18n";

export default function Layout({ theme, onToggleTheme }: { theme: string; onToggleTheme: () => void }) {
  const t = useT();
  const { lang, setLang } = useLang();
  const navigate = useNavigate();
  const user = session.user;

  const links: [string, string][] = [
    ["/", t("dashboard")],
    ["/live", t("liveMap")],
    ["/drivers", t("drivers")],
    ["/customers", t("customers")],
    ["/orders", t("orders")],
    ["/tariffs", t("tariffs")],
    ["/withdrawals", t("withdrawals")],
    ["/notifications", t("notifications")],
    ["/audit", t("auditLog")],
  ];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">
          Meshily<span className="dot">•</span>
        </div>
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
            {label}
          </NavLink>
        ))}
        <div className="spacer" />
        <a
          href="#logout"
          onClick={(e) => {
            e.preventDefault();
            session.clear();
            navigate("/login");
          }}
        >
          {t("logout")} — {user?.name}
        </a>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="title">{t("appName")}</div>
          <div className="controls">
            <button className="chip" onClick={() => setLang(lang === "ar" ? "fr" : "ar")}>
              {lang === "ar" ? "FR" : "عربي"}
            </button>
            <button className="chip" onClick={onToggleTheme}>{theme === "light" ? "🌙" : "☀️"}</button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
