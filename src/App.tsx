import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Venue from './pages/Venue'
import Pricing from './pages/Pricing'
import Book from './pages/Book'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="venue" element={<Venue />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="book" element={<Book />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
