export default function JsonLd() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'EventVenue',
    name: 'Allusion',
    description:
      'A refined venue for private events, intimate gatherings, and creative sessions in Belgium.',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'BE',
    },
    url: typeof window !== 'undefined' ? window.location.origin : '',
    image: '',
    sameAs: [],
    amenityFeature: [
      { '@type': 'LocationFeatureSpecification', name: 'WiFi', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Sound System', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Projector', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Kitchen Access', value: true },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
