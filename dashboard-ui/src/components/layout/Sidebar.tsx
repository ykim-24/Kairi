import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Overview" },
  { to: "/repos", label: "Repos" },
  { to: "/concepts", label: "Concepts" },
  { to: "/queue", label: "Queue" },
  { to: "/sync", label: "Sync" },
];

export function Sidebar() {
  return (
    <nav
      style={{
        width: "var(--sidebar-w)",
        minHeight: "100vh",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        padding: "20px 0",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "0 20px 24px",
          fontSize: 20,
          fontWeight: 700,
        }}
      >
        Kairi
      </div>
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === "/"}
          style={({ isActive }) => ({
            display: "block",
            padding: "10px 20px",
            fontSize: 14,
            color: isActive ? "var(--accent)" : "var(--muted)",
            background: isActive ? "rgba(88,166,255,0.08)" : "transparent",
            borderLeft: isActive
              ? "3px solid var(--accent)"
              : "3px solid transparent",
            fontWeight: isActive ? 600 : 400,
          })}
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}
