import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Bot, MessagesSquare } from 'lucide-react';
import { api, mensagemErro } from '../api.js';
import { useEventoSocket } from '../auth.jsx';
import Interruptor from '../components/Interruptor.jsx';

const formatarHora = (iso) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

const nomeDe = (c) => c.nome_contato || `+${c.remote_jid.split('@')[0]}`;

/** Renderiza o negrito/itálico do WhatsApp sem HTML injetado. */
function TextoWhatsApp({ texto }) {
  const partes = String(texto ?? '').split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return partes.map((p, i) => {
    if (/^\*[^*]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>;
    if (/^_[^_]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    return <span key={i}>{p}</span>;
  });
}

export default function Conversas() {
  const [conversas, setConversas] = useState([]);
  const [selecionadaId, setSelecionadaId] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [temMais, setTemMais] = useState(false);
  const fimRef = useRef(null);
  const selecionadaRef = useRef(null);
  selecionadaRef.current = selecionadaId;

  const carregarLista = useCallback(async () => {
    try {
      const { data } = await api.get('/api/conversations');
      setConversas(data);
    } catch (e) {
      toast.error(mensagemErro(e));
    }
  }, []);

  const carregarHistorico = useCallback(async (id, antesDe) => {
    try {
      const { data } = await api.get(`/api/conversations/${id}/messages`, { params: { limite: 50, antesDe } });
      setTemMais(data.mensagens.length === 50);
      setMensagens((atuais) => (antesDe ? [...data.mensagens, ...atuais] : data.mensagens));
      if (!antesDe) setTimeout(() => fimRef.current?.scrollIntoView(), 0);
    } catch (e) {
      toast.error(mensagemErro(e));
    }
  }, []);

  useEffect(() => {
    carregarLista();
  }, [carregarLista]);

  useEffect(() => {
    if (selecionadaId) carregarHistorico(selecionadaId);
  }, [selecionadaId, carregarHistorico]);

  useEventoSocket(
    'conversation_update',
    useCallback(
      ({ conversaId, mensagem }) => {
        carregarLista();
        if (mensagem && conversaId === selecionadaRef.current) {
          setMensagens((atuais) => (atuais.some((m) => m.id === mensagem.id) ? atuais : [...atuais, mensagem]));
          setTimeout(() => fimRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
        }
      },
      [carregarLista],
    ),
  );

  async function alternarAgente(conversa, ativo) {
    try {
      await api.patch(`/api/conversations/${conversa.id}`, { agente_ativo: ativo });
      setConversas((lista) => lista.map((c) => (c.id === conversa.id ? { ...c, agente_ativo: ativo } : c)));
      toast.success(ativo ? 'Agente ligado nesta conversa.' : 'Agente desligado nesta conversa.');
    } catch (e) {
      toast.error(mensagemErro(e));
    }
  }

  const selecionada = conversas.find((c) => c.id === selecionadaId);

  return (
    <section className="conversas">
      <aside className="lista-conversas cartao">
        <h2>Conversas</h2>
        {conversas.length === 0 && <p className="sutil">Nenhuma conversa ainda.</p>}
        <ul>
          {conversas.map((c) => (
            <li key={c.id}>
              <button
                className={`item-conversa${c.id === selecionadaId ? ' ativo' : ''}`}
                onClick={() => setSelecionadaId(c.id)}
              >
                <div className="item-linha">
                  <strong>{nomeDe(c)}</strong>
                  <span className="mono sutil">{formatarHora(c.ultima_em)}</span>
                </div>
                <div className="item-linha">
                  <span className="previa">{c.ultima_mensagem ?? ''}</span>
                  <span className={`badge mini ${c.agente_ativo ? 'verde' : 'cinza'}`}>
                    <Bot size={12} /> {c.agente_ativo ? 'on' : 'off'}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="chat cartao">
        {!selecionada ? (
          <div className="vazio">
            <MessagesSquare size={32} />
            <p>Selecione uma conversa para ver o histórico.</p>
          </div>
        ) : (
          <>
            <div className="chat-topo">
              <div>
                <h3>{nomeDe(selecionada)}</h3>
                <span className="mono sutil">{selecionada.remote_jid}</span>
              </div>
              <Interruptor
                ligado={selecionada.agente_ativo}
                aoMudar={(v) => alternarAgente(selecionada, v)}
                rotulo="Agente ativo"
              />
            </div>
            <div className="chat-mensagens">
              {temMais && (
                <button className="botao mini" onClick={() => carregarHistorico(selecionada.id, mensagens[0]?.id)}>
                  Carregar anteriores
                </button>
              )}
              {mensagens.map((m) => (
                <div key={m.id} className={`bolha ${m.papel}`}>
                  <div className="bolha-texto">
                    <TextoWhatsApp texto={m.conteudo} />
                  </div>
                  <span className="bolha-hora mono">{formatarHora(m.timestamp)}</span>
                </div>
              ))}
              <div ref={fimRef} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
