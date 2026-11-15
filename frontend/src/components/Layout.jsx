import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LogOut, MessageSquare, Settings, Smartphone } from 'lucide-react';
import { api } from '../api.js';
import { useEventoSocket, useSessao } from '../auth.jsx';

const LINKS = [
  { para: '/connections', rotulo: 'Conexões', Icone: Smartphone },
  { para: '/conversations', rotulo: 'Conversas', Icone: MessageSquare },
  { para: '/settings', rotulo: 'Configurações', Icone: Settings },
];

export default function Layout() {
  const { sair, socket } = useSessao();
  const [ativas, setAtivas] = useState(0);
  const [online, setOnline] = useState(false);

  const atualizar = useCallback(() => {
    api
      .get('/api/status')
      .then(({ data }) => setAtivas(data.conexoes_ativas))
      .catch(() => {});
  }, []);

  useEffect(atualizar, [atualizar]);
  useEventoSocket('connection_status', atualizar);

  useEffect(() => {
    if (!socket) return undefined;
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(socket.connected);
    socket.on('connect', on);
    socket.on('disconnect', off);
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
    };
  }, [socket]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="marca">
          <span className="marca-ponto" />
          <span>QTV</span>
        </div>
        <nav>
          {LINKS.map(({ para, rotulo, Icone }) => (
            <NavLink key={para} to={para} className={({ isActive }) => `nav-link${isActive ? ' ativo' : ''}`}>
              <Icone size={18} />
              <span>{rotulo}</span>
            </NavLink>
          ))}
        </nav>
        <button className="nav-link sair" onClick={sair}>
          <LogOut size={18} />
          <span>Sair</span>
        </button>
      </aside>
      <div className="principal">
        <header className="topo">
          <h1>Quanto Tô Valendo</h1>
          <div className="topo-info">
            <span className={`indicador ${online ? 'on' : 'off'}`} title={online ? 'Tempo real ativo' : 'Sem tempo real'} />
            <span className="mono">
              {ativas} {ativas === 1 ? 'conexão ativa' : 'conexões ativas'}
            </span>
          </div>
        </header>
        <main className="conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
