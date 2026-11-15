// Sessão do painel: token em memória (some ao recarregar) + socket autenticado.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, definirToken } from './api.js';
import { criarSocket } from './socket.js';

const ContextoSessao = createContext(null);

export function ProvedorSessao({ children }) {
  const [token, setToken] = useState(null);
  const [socket, setSocket] = useState(null);

  const entrar = useCallback(async (novoToken) => {
    definirToken(novoToken);
    try {
      await api.get('/api/settings'); // valida o token
    } catch (erro) {
      definirToken(null);
      throw erro;
    }
    setToken(novoToken);
  }, []);

  const sair = useCallback(() => {
    definirToken(null);
    setToken(null);
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    const s = criarSocket(token);
    setSocket(s);
    return () => {
      s.close();
      setSocket(null);
    };
  }, [token]);

  const valor = useMemo(() => ({ token, socket, entrar, sair }), [token, socket, entrar, sair]);
  return <ContextoSessao.Provider value={valor}>{children}</ContextoSessao.Provider>;
}

export const useSessao = () => useContext(ContextoSessao);

/** Assina um evento do socket enquanto o componente estiver montado. */
export function useEventoSocket(evento, tratador) {
  const { socket } = useSessao();
  useEffect(() => {
    if (!socket) return undefined;
    socket.on(evento, tratador);
    return () => socket.off(evento, tratador);
  }, [socket, evento, tratador]);
}
