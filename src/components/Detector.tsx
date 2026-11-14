import { IconFileText, IconWorld } from '@tabler/icons-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { CopyChecker } from './CopyChecker'
import { SiteChecker } from './SiteChecker'

type Mode = 'copy' | 'site'

const tabs: Array<{ id: Mode; label: string }> = [
  { id: 'copy', label: 'Copy' },
  { id: 'site', label: 'Website' },
]

const tabIcons = {
  copy: IconFileText,
  site: IconWorld,
} as const

export function Detector() {
  const [mode, setMode] = useState<Mode>('copy')
  const tabRefs = useRef<Record<Mode, HTMLButtonElement | null>>({
    copy: null,
    site: null,
  })

  const moveTab = (event: KeyboardEvent<HTMLButtonElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()

    const index = tabs.findIndex((tab) => tab.id === mode)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = tabs.length - 1

    const nextMode = tabs[next].id
    setMode(nextMode)
    tabRefs.current[nextMode]?.focus()
  }

  return (
    <section id="detector" className="detector" aria-labelledby="detector-title">
      <header className="section-head">
        <p className="eyebrow">01 / Detector</p>
        <h2 id="detector-title">
          {mode === 'copy' ? 'Scan a draft' : 'Scan a website'}
        </h2>
        <p className="section-head__note">
          {mode === 'copy'
            ? 'Paste a landing page, a launch post, or any copy you are about to ship. The scan runs in this tab. Nothing is uploaded.'
            : 'Enter a public page URL. A server-side fetch route pulls the HTML and linked CSS, then the rules run in this tab. Nothing is stored.'}
        </p>
      </header>

      <div className="mode-tabs" role="tablist" aria-label="Scan mode">
        {tabs.map((tab) => {
          const Icon = tabIcons[tab.id]
          return (
            <button
              className="mode-tab"
              key={tab.id}
              id={`tab-${tab.id}`}
              ref={(node) => {
                tabRefs.current[tab.id] = node
              }}
              type="button"
              role="tab"
              aria-selected={mode === tab.id}
              aria-controls={`panel-${tab.id}`}
              tabIndex={mode === tab.id ? 0 : -1}
              onClick={() => setMode(tab.id)}
              onKeyDown={moveTab}
            >
              <Icon size={15} stroke={2} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id="panel-copy"
        aria-labelledby="tab-copy"
        hidden={mode !== 'copy'}
      >
        <CopyChecker />
      </div>

      <div
        role="tabpanel"
        id="panel-site"
        aria-labelledby="tab-site"
        hidden={mode !== 'site'}
      >
        <SiteChecker />
      </div>
    </section>
  )
}
