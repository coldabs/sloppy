import { IconArrowUp } from '@tabler/icons-react'

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer__main">
        <p className="footer__brand">sloppy</p>
        <p className="footer__note">
          A local pattern checker for machine-made copy.
        </p>
      </div>
      <div className="footer__side">
        <a className="footer__top" href="#top">
          Back to top
          <IconArrowUp size={14} stroke={2} aria-hidden="true" />
        </a>
        <p className="footer__meta">
          Runs in the browser. Nothing is uploaded. Built with React,
          TypeScript, and Vite.
        </p>
      </div>
    </footer>
  )
}
