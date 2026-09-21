import Link from "next/link";

export default function NotFound() {
  return (
    <div className="app-shell">
      <div className="top-brand"><span>Northstar</span><span>Operations</span></div>
      <div className="login-shell">
        <div className="panel login-card">
          <div className="eyebrow">404</div>
          <div className="panel-title" style={{ marginTop: 8 }}>This page does not exist</div>
          <div className="panel-subtitle" style={{ margin: "8px 0 16px" }}>Check the address or head back to the overview.</div>
          <Link className="primary-button" href="/">Back to overview</Link>
        </div>
      </div>
    </div>
  );
}
