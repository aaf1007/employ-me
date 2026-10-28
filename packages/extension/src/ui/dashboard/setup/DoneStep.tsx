export function DoneStep() {
  return (
    <section className="card stack" data-testid="step-done">
      <div>
        <h2>Your Profile is ready</h2>
        <p className="card-intro">You can change any of it later on the Profile page.</p>
      </div>
      <ol className="stack" style={{ gap: 6, margin: 0, paddingLeft: 20 }}>
        <li>Open a job application on Greenhouse, Lever or Ashby.</li>
        <li>Click the employ-me icon in Chrome’s toolbar, then click Fill.</li>
        <li>Check what was filled, finish anything under “Needs your review”, and submit it yourself.</li>
      </ol>
      <div className="row">
        <a className="btn btn-primary" href="#profile">
          See my Profile
        </a>
        <a className="btn" href="#tracker">
          Open the Tracker
        </a>
      </div>
    </section>
  );
}
