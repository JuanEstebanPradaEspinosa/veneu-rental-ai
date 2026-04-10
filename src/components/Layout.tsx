import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import Footer from './Footer'
import JsonLd from './JsonLd'

export default function Layout() {
  return (
    <>
      <JsonLd />
      <Navbar />
      <main id="main-content" className="pt-[73px]">
        <Outlet />
      </main>
      <Footer />
    </>
  )
}
