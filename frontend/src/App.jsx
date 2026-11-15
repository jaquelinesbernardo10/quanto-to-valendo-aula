import { Navigate, Route, Routes } from 'react-router-dom';
import { useSessao } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Conexoes from './pages/Conexoes.jsx';
import Conversas from './pages/Conversas.jsx';
import Configuracoes from './pages/Configuracoes.jsx';

export default function App() {
  const { token } = useSessao();
  if (!token) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/connections" element={<Conexoes />} />
        <Route path="/conversations" element={<Conversas />} />
        <Route path="/settings" element={<Configuracoes />} />
        <Route path="*" element={<Navigate to="/connections" replace />} />
      </Route>
    </Routes>
  );
}
