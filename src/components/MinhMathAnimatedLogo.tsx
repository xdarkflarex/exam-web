'use client'

import { useRef, useEffect, useCallback } from 'react'

const SHAPE_RIBBON_M = 'M278 690 L278 318 Q278 292 298 312 L500 514 L702 312 Q722 292 722 318 L722 690'
const SHAPE_RIBBON_SIGMA = 'M322 318 L690 318 L690 376 L690 318 L322 318 L530 514 L322 706 L690 706 L690 646'
const SHAPE_RAIL_M = 'M278 690 L278 318 Q278 292 298 312 L500 514 L702 312 Q722 292 722 318 L722 690'
const SHAPE_RAIL_SIGMA = 'M322 318 L690 318 L690 378 M322 706 L690 706 L690 646'

const AUTO_SWITCH_DELAY = 5200
const MORPH_DURATION = 1.28

const SPARKLE_POS = {
  m: [{ cx: 702, cy: 312 }, { cx: 500, cy: 514 }],
  sigma: [{ cx: 690, cy: 318 }, { cx: 515, cy: 706 }],
}

interface Props {
  size?: number
  className?: string
}

let gsapLoadPromise: Promise<boolean> | null = null

function loadGsapPlugins(): Promise<boolean> {
  if (gsapLoadPromise) return gsapLoadPromise
  gsapLoadPromise = new Promise((resolve) => {
    if (typeof window === 'undefined') { resolve(false); return }
    const w = window as any
    if (w.gsap && w.MorphSVGPlugin && w.DrawSVGPlugin) { resolve(true); return }

    const scripts = [
      'https://cdn.jsdelivr.net/npm/gsap@3.15/dist/gsap.min.js',
      'https://cdn.jsdelivr.net/npm/gsap@3.15/dist/MorphSVGPlugin.min.js',
      'https://cdn.jsdelivr.net/npm/gsap@3.15/dist/DrawSVGPlugin.min.js',
    ]
    let loaded = 0
    const onLoad = () => { if (++loaded === scripts.length) resolve(!!w.gsap && !!w.MorphSVGPlugin && !!w.DrawSVGPlugin) }
    const onErr = () => { if (++loaded === scripts.length) resolve(false) }

    // Load sequentially to ensure gsap loads first
    const loadNext = (i: number) => {
      if (i >= scripts.length) return
      const s = document.createElement('script')
      s.src = scripts[i]
      s.onload = () => { onLoad(); loadNext(i + 1) }
      s.onerror = () => { onErr(); loadNext(i + 1) }
      document.head.appendChild(s)
    }
    // Load gsap first, then plugins in parallel
    const sGsap = document.createElement('script')
    sGsap.src = scripts[0]
    sGsap.onload = () => {
      loaded++
      const s1 = document.createElement('script')
      s1.src = scripts[1]
      s1.onload = onLoad; s1.onerror = onErr
      const s2 = document.createElement('script')
      s2.src = scripts[2]
      s2.onload = onLoad; s2.onerror = onErr
      document.head.appendChild(s1)
      document.head.appendChild(s2)
    }
    sGsap.onerror = () => resolve(false)
    document.head.appendChild(sGsap)
  })
  return gsapLoadPromise
}

export default function MinhMathAnimatedLogo({ size = 40, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<'m' | 'sigma'>('m')
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const ambientRef = useRef<any>(null)
  const transRef = useRef<any>(null)
  const readyRef = useRef(false)

  const cleanup = useCallback(() => {
    clearTimeout(timerRef.current)
    ambientRef.current?.kill()
    transRef.current?.kill()
  }, [])

  useEffect(() => {
    let cancelled = false

    loadGsapPlugins().then((ok) => {
      if (cancelled || !ok || !containerRef.current) return
      const w = window as any
      const gsap = w.gsap
      const MorphSVGPlugin = w.MorphSVGPlugin
      const DrawSVGPlugin = w.DrawSVGPlugin
      if (!gsap || !MorphSVGPlugin || !DrawSVGPlugin) return

      gsap.registerPlugin(MorphSVGPlugin, DrawSVGPlugin)
      readyRef.current = true

      const root = containerRef.current!
      const svg = root.querySelector('svg')!
      const ribbonLayers = root.querySelectorAll('.mm-ribbon-shadow, .mm-ribbon-core, .mm-ribbon-light, .mm-ribbon-sweep')
      const railLayers = root.querySelectorAll('.mm-rail-shadow, .mm-rail-core, .mm-rail-light')
      const trace = root.querySelector('.mm-transition-trace')
      const sparkA = root.querySelector('#mm-spark-a')
      const sparkB = root.querySelector('#mm-spark-b')
      const sparkles = [sparkA, sparkB]
      const tileAurora = root.querySelector('.mm-tile-aurora')
      const pulseRing = root.querySelector('.mm-pulse-ring')
      const ribbonSweep = root.querySelector('.mm-ribbon-sweep')
      const tileEdge = root.querySelector('.mm-tile-edge')

      // Init
      sparkles.forEach((s, i) => {
        if (s) gsap.set(s, { attr: SPARKLE_POS.m[i], transformOrigin: '50% 50%' })
      })
      gsap.set(tileAurora, { svgOrigin: '500 500' })
      gsap.set(pulseRing, { svgOrigin: '500 500', scale: 0.72 })
      gsap.set(trace, { autoAlpha: 0, drawSVG: '0% 0%' })

      // Intro
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!reducedMotion) {
        gsap.timeline({ defaults: { ease: 'power3.out' } })
          .fromTo(svg, { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, duration: 0.85 })
          .from(tileEdge, { drawSVG: '0% 0%', duration: 1.05 }, 0.08)
          .from(ribbonLayers, { drawSVG: '0% 0%', duration: 1.02, stagger: 0.03 }, 0.18)
          .fromTo(sparkles, { autoAlpha: 0, scale: 0.2 }, { autoAlpha: 0.72, scale: 1, duration: 0.42, stagger: 0.1 }, 0.72)
          .to(sparkles, { autoAlpha: 0, scale: 0.62, duration: 0.36, stagger: 0.04 }, 1.18)
      }

      // Ambient
      function startAmbient() {
        ambientRef.current?.kill()
        ambientRef.current = gsap.timeline({ repeat: -1, repeatDelay: 0.38 })
          .to(tileAurora, { scale: 1.045, autoAlpha: 0.78, duration: 1.45, ease: 'sine.inOut' })
          .to(tileAurora, { scale: 1, autoAlpha: 0.48, duration: 1.45, ease: 'sine.inOut' })
          .fromTo(ribbonSweep, { drawSVG: '0% 7%', autoAlpha: 0 }, { drawSVG: '93% 100%', autoAlpha: 0.95, duration: 1.08, ease: 'power2.inOut' }, 0.35)
          .to(ribbonSweep, { autoAlpha: 0, duration: 0.18 }, '<0.9')
      }

      // Switch
      function switchLogo() {
        const next = stateRef.current === 'm' ? 'sigma' : 'm'
        const targetRibbon = next === 'm' ? SHAPE_RIBBON_M : SHAPE_RIBBON_SIGMA
        const targetRail = next === 'm' ? SHAPE_RAIL_M : SHAPE_RAIL_SIGMA
        const railAlpha = next === 'sigma' ? 0.94 : 0.13

        transRef.current?.kill()
        if (reducedMotion) {
          gsap.set(ribbonLayers, { morphSVG: targetRibbon })
          gsap.set(railLayers, { morphSVG: targetRail, autoAlpha: railAlpha })
        } else {
          ambientRef.current?.kill()
          transRef.current = gsap.timeline({
            defaults: { overwrite: 'auto' },
            onComplete: () => { if (!document.hidden) startAmbient() },
          })
            .addLabel('change')
            .to(svg, { scale: 1.028, duration: 0.24, ease: 'power2.out' }, 'change')
            .fromTo(pulseRing, { scale: 0.7, autoAlpha: 0.7 }, { scale: 1.2, autoAlpha: 0, duration: 0.9, ease: 'power2.out' }, 'change')
            .set(trace, { morphSVG: targetRibbon, drawSVG: '0% 0%', autoAlpha: 0 })
            .fromTo(trace, { drawSVG: '0% 0%', autoAlpha: 0 }, { drawSVG: '0% 100%', autoAlpha: 0.42, duration: 0.52, ease: 'power2.out' }, 'change+=0.03')
            .to(trace, { autoAlpha: 0, duration: 0.42, ease: 'power1.out' }, 'change+=0.5')
            .to(ribbonLayers, { morphSVG: { shape: targetRibbon, type: 'rotational', origin: '50% 50%' }, duration: MORPH_DURATION, ease: 'power3.inOut' }, 'change')
            .to(railLayers, { morphSVG: { shape: targetRail, type: 'rotational', origin: '50% 50%' }, autoAlpha: railAlpha, duration: MORPH_DURATION * 0.94, ease: 'power3.inOut' }, 'change+=0.04')
            .add(() => {
              sparkles.forEach((s, i) => {
                if (s) gsap.to(s, { attr: SPARKLE_POS[next][i], scale: 1.24, autoAlpha: 0.92, duration: 0.48, ease: 'power3.inOut', overwrite: 'auto' })
              })
              gsap.to(sparkles, { scale: 0.65, autoAlpha: 0, duration: 0.62, delay: 0.44, ease: 'power2.out', overwrite: 'auto' })
            }, 'change+=0.42')
            .to(svg, { scale: 1, duration: 0.48, ease: 'back.out(1.7)' }, 'change+=0.95')
        }
        stateRef.current = next
      }

      function scheduleSwitch() {
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => { switchLogo(); scheduleSwitch() }, AUTO_SWITCH_DELAY)
      }

      if (!reducedMotion) startAmbient()
      scheduleSwitch()

      // Click
      const onClick = () => { switchLogo(); scheduleSwitch() }
      root.addEventListener('click', onClick)

      // Pointer tilt (desktop only)
      const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
      const onMove = (e: PointerEvent) => {
        const b = root.getBoundingClientRect()
        const x = (e.clientX - b.left) / b.width - 0.5
        const y = (e.clientY - b.top) / b.height - 0.5
        gsap.to(svg, { rotationY: x * 7, rotationX: y * -7, x: x * 8, y: y * 8, transformPerspective: 900, transformOrigin: '50% 50%', duration: 0.42, ease: 'power2.out', overwrite: 'auto' })
      }
      const onLeave = () => {
        gsap.to(svg, { rotationX: 0, rotationY: 0, x: 0, y: 0, duration: 0.65, ease: 'power3.out', overwrite: 'auto' })
      }
      if (finePointer && !reducedMotion) {
        root.addEventListener('pointermove', onMove as any)
        root.addEventListener('pointerleave', onLeave)
      }

      // Visibility
      const onVis = () => {
        clearTimeout(timerRef.current)
        if (document.hidden) { ambientRef.current?.kill(); return }
        if (!reducedMotion) startAmbient()
        scheduleSwitch()
      }
      document.addEventListener('visibilitychange', onVis)

      return () => {
        cancelled = true
        cleanup()
        root.removeEventListener('click', onClick)
        root.removeEventListener('pointermove', onMove as any)
        root.removeEventListener('pointerleave', onLeave)
        document.removeEventListener('visibilitychange', onVis)
      }
    })

    return () => { cancelled = true; cleanup() }
  }, [cleanup])

  return (
    <div
      ref={containerRef}
      className={`mm-logo-wrap ${className}`}
      style={{ width: size, height: size, cursor: 'pointer' }}
    >
      <svg viewBox="0 0 1000 1000" className="mm-logo-svg">
        <defs>
          <radialGradient id="mm-tile-fill" cx="50%" cy="42%" r="66%">
            <stop offset="0%" stopColor="#082737" />
            <stop offset="58%" stopColor="#03131e" />
            <stop offset="100%" stopColor="#01080f" />
          </radialGradient>
          <linearGradient id="mm-tile-edge" x1="6%" y1="3%" x2="92%" y2="100%">
            <stop offset="0%" stopColor="#f1ffff" />
            <stop offset="16%" stopColor="#15eaff" />
            <stop offset="62%" stopColor="#087f99" />
            <stop offset="100%" stopColor="#5ff6ff" />
          </linearGradient>
          <linearGradient id="mm-ribbon-fill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8dffff" />
            <stop offset="35%" stopColor="#13e7f6" />
            <stop offset="100%" stopColor="#05aebf" />
          </linearGradient>
          <filter id="mm-tile-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="22" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.04  0 0 0 0 0.92  0 0 0 0 1  0 0 0 0.9 0" />
          </filter>
          <filter id="mm-ribbon-glow" x="-45%" y="-45%" width="190%" height="190%">
            <feGaussianBlur stdDeviation="18" result="soft" />
            <feMerge>
              <feMergeNode in="soft" />
              <feMergeNode in="soft" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="mm-pulse-ring" cx="50%" cy="50%" r="50%">
            <stop offset="56%" stopColor="transparent" />
            <stop offset="86%" stopColor="#2bebff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        <rect className="mm-tile-aurora" x="104" y="104" width="792" height="792" rx="154" />
        <rect className="mm-tile" x="120" y="120" width="760" height="760" rx="146" />
        <rect className="mm-tile-edge" x="120" y="120" width="760" height="760" rx="146" />
        <circle className="mm-pulse-ring" cx="500" cy="500" r="352" />

        <g className="mm-mark">
          <path className="mm-ribbon-shadow" d={SHAPE_RIBBON_M} />
          <path className="mm-ribbon-core" d={SHAPE_RIBBON_M} />
          <path className="mm-ribbon-light" d={SHAPE_RIBBON_M} />
          <path className="mm-ribbon-sweep" d={SHAPE_RIBBON_M} />
          <path className="mm-transition-trace" d={SHAPE_RIBBON_M} />
          <path className="mm-rail-shadow" d={SHAPE_RAIL_M} />
          <path className="mm-rail-core" d={SHAPE_RAIL_M} />
          <path className="mm-rail-light" d={SHAPE_RAIL_M} />
        </g>

        <g className="mm-sparkles" aria-hidden="true">
          <circle id="mm-spark-a" r="14" />
          <circle id="mm-spark-b" r="9" />
        </g>
      </svg>
    </div>
  )
}
