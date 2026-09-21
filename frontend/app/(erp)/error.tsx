"use client";

import { useEffect } from "react";

export default function ErpError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="panel page-panel" role="alert" style={{ marginTop: 27 }}>
      <div className="panel-header">
        <div>
          <div className="panel-title">This page ran into a problem</div>
          <div className="panel-subtitle">The error has been logged. You can try loading the page again.</div>
        </div>
        <button className="primary-button" onClick={reset}>Try again</button>
      </div>
    </div>
  );
}
