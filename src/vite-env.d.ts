/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TALLY_FORM_URL: string
  readonly VITE_STRIPE_PAYMENT_LINK: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
