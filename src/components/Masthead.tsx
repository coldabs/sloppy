export function Masthead() {
  return (
    <header className="masthead">
      <a className="masthead__brand" href="#top">
        <span className="masthead__mark" aria-hidden="true" />
        sloppy
      </a>
      <nav className="masthead__nav" aria-label="Sections">
        <a href="#detector">Detector</a>
        <a href="#method">Method</a>
      </nav>
    </header>
  )
}
