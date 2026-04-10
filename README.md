# Allusion — Venue Rental Website

A refined, luxury-minimalist venue rental website for Allusion, built with React, Vite, TypeScript, and Tailwind CSS.

## Stack

- **React 19** + **Vite 8** + **TypeScript**
- **Tailwind CSS v4** for styling
- **React Router v6** for client-side routing
- **Tally.so** embedded form for booking inquiries
- **Stripe** payment link for deposit collection

## Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Hero, venue intro, highlights, CTA |
| `/venue` | Venue | Gallery, specs, amenities |
| `/pricing` | Pricing | Tier packages, what's included |
| `/book` | Book | Tally form embed + Stripe deposit link |

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Environment Variables

Copy `.env.example` to `.env` and update the values:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `VITE_TALLY_FORM_URL` | Your Tally.so form URL for booking inquiries |
| `VITE_STRIPE_PAYMENT_LINK` | Your Stripe payment link for deposit collection |

## Deployment

This site is configured for Vercel deployment. Security headers are defined in `vercel.json`.

Push to `main` to trigger automatic deployment.

## License

See [LICENSE](./LICENSE).
