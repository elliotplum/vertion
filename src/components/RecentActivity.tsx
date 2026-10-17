// This view is intentionally a placeholder until global activity data is implemented.
export function RecentActivity() {
  return (
    <div className="view-section">
      <h2>Recent Bounces (Global)</h2>
      <p className="subtitle">Recent changes across your entire scanned workspace.</p>
      <div className="empty-state">
        <p>Global feed of recent project modifications and audio bounces.</p>
        <p className="hint-text">Press [TAB] to return to Project Explorer.</p>
      </div>
    </div>
  );
}
