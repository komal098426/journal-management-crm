export default function Loading() {
  return (
    <div className="panel data-panel page-panel" role="status" aria-live="polite" style={{ marginTop: 27 }}>
      <div className="panel-header">
        <div>
          <span className="skeleton" style={{ height: 14, width: 180 }} />
          <span className="skeleton" style={{ height: 10, width: 260, marginTop: 8 }} />
        </div>
      </div>
      <div className="stack" style={{ padding: "0 20px 20px" }}>
        {Array.from({ length: 6 }).map((_, index) => (
          <span key={index} className="skeleton" style={{ height: 34 }} />
        ))}
      </div>
    </div>
  );
}
