import { Detector } from './components/Detector'
import { Footer } from './components/Footer'
import { Hero } from './components/Hero'
import { Masthead } from './components/Masthead'
import { Method } from './components/Method'

function App() {
  return (
    <div className="page" id="top">
      <a className="skip-link" href="#main">
        Skip to the content
      </a>
      <Masthead />
      <main id="main" tabIndex={-1}>
        <Hero />
        <Detector />
        <Method />
      </main>
      <Footer />
    </div>
  )
}

export default App
