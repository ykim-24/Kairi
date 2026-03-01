import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface TerminalMarkdownProps {
  children: string;
}

const components: Components = {
  h1({ children }) {
    return (
      <div style={{ marginBottom: 12 }}>
        <h1
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--text)",
            margin: 0,
          }}
        >
          {children}
        </h1>
        <div style={{ color: "var(--border)", fontSize: 14 }}>
          ═══════════════════════════════════════
        </div>
      </div>
    );
  },
  h2({ children }) {
    return (
      <div style={{ marginBottom: 10, marginTop: 16 }}>
        <h2
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--text)",
            margin: 0,
          }}
        >
          {children}
        </h2>
        <div style={{ color: "var(--border)", fontSize: 14 }}>
          ───────────────────────────────────
        </div>
      </div>
    );
  },
  h3({ children }) {
    return (
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--accent)",
          marginBottom: 6,
          marginTop: 12,
        }}
      >
        {children}
      </h3>
    );
  },
  code({ children, className, ...rest }) {
    const isBlock = className?.startsWith("language-");
    if (isBlock) {
      return (
        <pre
          style={{
            background: "var(--bg)",
            borderRadius: 0,
            padding: 12,
            overflow: "auto",
            fontSize: 12,
            border: "1px solid var(--border)",
            color: "var(--green)",
            textShadow: "0 0 4px rgba(130,212,160,0.2)",
            margin: "8px 0",
          }}
        >
          <code className={className} {...rest}>
            {children}
          </code>
        </pre>
      );
    }
    return (
      <code
        style={{
          background: "rgba(212,130,158,0.08)",
          borderRadius: 0,
          padding: "1px 4px",
          fontSize: "0.9em",
          color: "var(--yellow)",
        }}
        {...rest}
      >
        {children}
      </code>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
  blockquote({ children }) {
    return (
      <blockquote
        style={{
          borderLeft: "3px solid var(--accent)",
          paddingLeft: 12,
          margin: "8px 0",
          color: "var(--muted)",
        }}
      >
        {children}
      </blockquote>
    );
  },
  ul({ children }) {
    return (
      <ul style={{ listStyle: "none", paddingLeft: 0, margin: "8px 0" }}>
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return (
      <ol style={{ paddingLeft: 20, margin: "8px 0" }}>
        {children}
      </ol>
    );
  },
  li({ children }) {
    return (
      <li
        style={{
          paddingLeft: 16,
          position: "relative",
          marginBottom: 10,
          paddingBottom: 10,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: 0,
            color: "var(--accent)",
          }}
        >
          ›
        </span>
        {children}
      </li>
    );
  },
  hr() {
    return (
      <div
        style={{
          color: "var(--border)",
          margin: "12px 0",
          fontSize: 14,
        }}
      >
        ──────────────────────────────────────────
      </div>
    );
  },
  strong({ children }) {
    return (
      <strong style={{ color: "var(--accent)", fontWeight: 700 }}>
        {children}
      </strong>
    );
  },
  table({ children }) {
    return (
      <div style={{ overflowX: "auto", margin: "10px 0" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
            border: "1px solid var(--border)",
          }}
        >
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return (
      <thead style={{ background: "rgba(212,130,158,0.06)" }}>
        {children}
      </thead>
    );
  },
  th({ children }) {
    return (
      <th
        style={{
          textAlign: "left",
          padding: "8px 12px",
          borderBottom: "2px solid var(--border)",
          borderRight: "1px solid var(--border)",
          color: "var(--accent)",
          textTransform: "uppercase",
          letterSpacing: 1,
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          borderRight: "1px solid var(--border)",
          verticalAlign: "top",
        }}
      >
        {children}
      </td>
    );
  },
  p({ children }) {
    return <p style={{ margin: "6px 0" }}>{children}</p>;
  },
};

export function TerminalMarkdown({ children }: TerminalMarkdownProps) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.6 }}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </Markdown>
    </div>
  );
}
