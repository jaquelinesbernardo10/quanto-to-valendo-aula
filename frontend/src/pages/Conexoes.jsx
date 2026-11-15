import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Plug, PlugZap, Trash2, QrCode } from 'lucide-react';
import { api, mensagemErro } from '../api.js';
import { useEventoSocket } from '../auth.jsx';
import Modal from '../components/Modal.jsx';

const BADGES = {
  open: { classe: 'verde', texto: 'Conectado' },
  qr: { classe: 'amarelo', texto: 'Aguardando QR' },
  connecting: { classe: 'amarelo', texto: 'Conectando…' },
  close: { classe: 'vermelho', texto: 'Desconectado' },
};

function formatarUptime(segundos) {
  if (!segundos) return '—';
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  return h ? `${h}h ${m}min` : `${m}min`;
}

export default function Conexoes() {
  const [conexoes, setConexoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [novaAberta, setNovaAberta] = useState(false);
  const [nome, setNome] = useState('');
  const [qr, setQr] = useState({ connectionId: null, imagem: null });
  const qrAbertoRef = useRef(null);
  qrAbertoRef.current = qr.connectionId;

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get('/api/connections');
      setConexoes(data);
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 30000); // uptime e métricas
    return () => clearInterval(t);
  }, [carregar]);

  useEventoSocket(
    'connection_status',
    useCallback(
      ({ connectionId, status }) => {
        setConexoes((lista) => lista.map((c) => (c.id === connectionId ? { ...c, status } : c)));
        if (status === 'open') {
          if (qrAbertoRef.current === connectionId) {
            toast.success('WhatsApp conectado!');
            setQr({ connectionId: null, imagem: null });
          }
          carregar();
        }
      },
      [carregar],
    ),
  );

  useEventoSocket(
    'qr_update',
    useCallback(({ connectionId, qr: imagem }) => {
      setQr((atual) => (atual.connectionId === connectionId ? { connectionId, imagem } : atual));
    }, []),
  );

  async function criar(e) {
    e.preventDefault();
    try {
      await api.post('/api/connections', { nome: nome.trim() });
      setNome('');
      setNovaAberta(false);
      toast.success('Conexão criada.');
      carregar();
    } catch (err) {
      toast.error(mensagemErro(err));
    }
  }

  async function conectar(c) {
    setQr({ connectionId: c.id, imagem: null });
    try {
      await api.post(`/api/connections/${c.id}/connect`);
    } catch (err) {
      setQr({ connectionId: null, imagem: null });
      toast.error(mensagemErro(err));
    }
  }

  async function desconectar(c) {
    try {
      await api.post(`/api/connections/${c.id}/disconnect`);
      toast.success('Desconectado.');
      carregar();
    } catch (err) {
      toast.error(mensagemErro(err));
    }
  }

  async function excluir(c) {
    if (!window.confirm(`Excluir a conexão "${c.nome}"? A sessão do WhatsApp será apagada.`)) return;
    try {
      await api.delete(`/api/connections/${c.id}`);
      toast.success('Conexão excluída.');
      carregar();
    } catch (err) {
      toast.error(mensagemErro(err));
    }
  }

  const conexaoQr = conexoes.find((c) => c.id === qr.connectionId);

  return (
    <section>
      <div className="secao-topo">
        <h2>Conexões</h2>
        <button className="botao primario" onClick={() => setNovaAberta(true)}>
          <Plus size={16} /> Nova conexão
        </button>
      </div>

      {carregando ? (
        <p className="sutil">Carregando…</p>
      ) : conexoes.length === 0 ? (
        <div className="vazio cartao">
          <QrCode size={32} />
          <p>Nenhuma conexão ainda. Crie uma e escaneie o QR com o WhatsApp do número dedicado.</p>
        </div>
      ) : (
        <div className="grade">
          {conexoes.map((c) => {
            const badge = BADGES[c.status] ?? BADGES.close;
            const ativa = c.status === 'open' || c.status === 'connecting' || c.status === 'qr';
            return (
              <article key={c.id} className="cartao conexao">
                <div className="conexao-topo">
                  <h3>{c.nome}</h3>
                  <span className={`badge ${badge.classe}`}>{badge.texto}</span>
                </div>
                <dl className="metricas mono">
                  <div>
                    <dt>Número</dt>
                    <dd>{c.numero ? `+${c.numero}` : '—'}</dd>
                  </div>
                  <div>
                    <dt>Uptime</dt>
                    <dd>{formatarUptime(c.uptime_segundos)}</dd>
                  </div>
                  <div>
                    <dt>Mensagens</dt>
                    <dd>{c.mensagens}</dd>
                  </div>
                  <div>
                    <dt>Contatos</dt>
                    <dd>{c.contatos}</dd>
                  </div>
                </dl>
                <div className="acoes">
                  {ativa ? (
                    <button className="botao" onClick={() => desconectar(c)}>
                      <Plug size={16} /> Desconectar
                    </button>
                  ) : (
                    <button className="botao primario" onClick={() => conectar(c)}>
                      <PlugZap size={16} /> Conectar
                    </button>
                  )}
                  <button className="botao perigo" onClick={() => excluir(c)} aria-label="Excluir">
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {novaAberta && (
        <Modal titulo="Nova conexão" aoFechar={() => setNovaAberta(false)}>
          <form onSubmit={criar} className="form">
            <label className="campo">
              <span>Nome</span>
              <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Número principal" />
            </label>
            <button className="botao primario" disabled={!nome.trim()}>
              Criar
            </button>
          </form>
        </Modal>
      )}

      {qr.connectionId && (
        <Modal titulo={`Conectar ${conexaoQr?.nome ?? ''}`} aoFechar={() => setQr({ connectionId: null, imagem: null })}>
          <div className="qr">
            {qr.imagem ? (
              <img src={qr.imagem} alt="QR Code do WhatsApp" />
            ) : (
              <div className="qr-espera">
                {conexaoQr?.sessao_salva ? 'Religando com a sessão salva…' : 'Gerando QR…'}
              </div>
            )}
            <p className="sutil">
              No celular: WhatsApp › <strong>Aparelhos conectados</strong> › Conectar um aparelho.
            </p>
          </div>
        </Modal>
      )}
    </section>
  );
}
