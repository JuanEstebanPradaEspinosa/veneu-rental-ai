import type { ReactNode } from 'react'
import { useFadeIn } from '../hooks/useFadeIn'

interface SectionProps {
  children: ReactNode
  className?: string
  dark?: boolean
  id?: string
}

export default function Section({ children, className = '', dark, id }: SectionProps) {
  const ref = useFadeIn<HTMLElement>()

  return (
    <section
      ref={ref}
      id={id}
      className={`fade-in px-6 py-16 md:py-24 ${
        dark ? 'bg-offblack text-warmwhite' : ''
      } ${className}`}
    >
      <div className="mx-auto max-w-5xl">{children}</div>
    </section>
  )
}
