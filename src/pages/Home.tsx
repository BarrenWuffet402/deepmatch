import { useEffect } from 'react'
import styles from './Home.module.css'

export default function Home() {
  const cfg = window.APP

  useEffect(() => {
    document.title = cfg.name
    const r = document.documentElement.style
    r.setProperty('--accent',   cfg.accent)
    r.setProperty('--accent-b', cfg.accentB)
    r.setProperty('--bg',       cfg.bg)
    document.body.style.background = cfg.bg
  }, [cfg])

  return (
    <>
      {/* Animated background */}
      <div className={styles.orbs} aria-hidden="true">
        <div className={`${styles.orb} ${styles.orb1}`} />
        <div className={`${styles.orb} ${styles.orb2}`} />
        <div className={`${styles.orb} ${styles.orb3}`} />
      </div>
      <div className={styles.noise} aria-hidden="true" />

      {/* Main content */}
      <div className={styles.stage}>
        <h1 className={styles.wordmark}>{cfg.name}</h1>
        <p className={styles.tagline}>{cfg.tagline}</p>
        <div className={styles.dot} />
        <div className={styles.status}>
          <span className={styles.statusDot} />
          <span>Coming soon</span>
        </div>
        <a href="/landing" className={styles.demoLink}>full landing page →</a>
        <a href="/demo" className={styles.demoLink} style={{marginTop: '8px', fontSize: '13px', opacity: 0.7}}>see prototype →</a>
        <a href="/video-demo" className={styles.demoLink} style={{marginTop: '8px', fontSize: '13px', opacity: 0.5}}>video profile demo →</a>
      </div>

      {/* Admin link */}
      <a className={styles.adminLink} href="/admin.html">admin</a>
    </>
  )
}
