import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-shell" aria-live="polite">
      <div className="not-found-panel">
        <h1 className="not-found-title">This page doesn&apos;t exist</h1>
        <p className="not-found-copy">
          It may have been moved, removed, or never existed.
        </p>

        <div className="not-found-code" aria-label="404 error code">
          <strong>404 NOT_FOUND</strong>
          <span className="not-found-hash">hgk01:njdkn-1796283324613-17da1451a25</span>
        </div>
      </div>

      <div className="not-found-footer">
        <Link href="/">View documentation</Link>
        <span> / </span>
        <Link href="/">Copy debug prompt</Link>
      </div>
    </main>
  );
}
