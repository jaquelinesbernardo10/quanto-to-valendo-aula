import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useSessao } from '../auth.jsx';
import { mensagemErro } from '../api.js';

export default function Login() {
  const { entrar } = useSessao();
  const [token, setToken] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    if (!token.trim()) return;
    setCarregando(true);
    setErro('');
    try {
      await entrar(token.trim());
    } catch (err) {
      setErro(err?.response?.status === 401 ? 'Token inválido.' : mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login">
      <form className="cartao login-cartao" onSubmit={enviar}>
        <div className="marca grande">
          <span className="marca-ponto" />
          <span>Quanto Tô Valendo</span>
        </div>
        <p className="sutil">Painel administrativo. Informe o token de administrador.</p>
        <label className="campo">
          <span>Token</span>
          <div className="campo-icone">
            <KeyRound size={16} />
            <input
              type="password"
              autoFocus
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ADMIN_TOKEN"
              className="mono"
            />
          </div>
        </label>
        {erro && <p className="erro">{erro}</p>}
        <button className="botao primario" disabled={carregando || !token.trim()}>
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
