import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="border-t border-offblack/10 bg-offblack text-warmwhite/70">
      <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Brand */}
          <div>
            <Link
              to="/"
              className="font-display text-2xl font-semibold text-warmwhite"
            >
              Allusion
            </Link>
            <p className="mt-3 text-sm leading-relaxed">
              A refined venue for private events, intimate gatherings, and
              creative sessions in Belgium.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-warmwhite mb-4">
              Quick Links
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/venue" className="hover:text-gold transition-colors">
                  The Venue
                </Link>
              </li>
              <li>
                <Link
                  to="/pricing"
                  className="hover:text-gold transition-colors"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link to="/book" className="hover:text-gold transition-colors">
                  Book Now
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-warmwhite mb-4">
              Contact
            </h3>
            <address className="not-italic text-sm space-y-2">
              <p>Belgium</p>
              <p>
                <a
                  href="mailto:hello@allusion.space"
                  className="hover:text-gold transition-colors"
                >
                  hello@allusion.space
                </a>
              </p>
            </address>
          </div>
        </div>

        <div className="mt-12 border-t border-warmwhite/10 pt-6 text-center text-xs">
          <p>&copy; {new Date().getFullYear()} Allusion. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
