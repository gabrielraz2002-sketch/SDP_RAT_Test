import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import HomePage from './pages/HomePage.jsx';
import RepoDashboard from './pages/RepoDashboard.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/repo/:id" element={<RepoDashboard />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
