import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { RotateCcw, Save } from 'lucide-react';
import { api, mensagemErro } from '../api.js';
import Interruptor from '../components/Interruptor.jsx';

export default function Configuracoes() {
  const [config, setConfig] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [modelo, setModelo] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api
      .get('/api/settings')
      .then(({ data }) => {
        setConfig(data);
        setPrompt(data.system_prompt_override || data.prompt_padrao);
        setModelo(data.modelo);
        setAtivo(data.agente_ativo_global);
      })
      .catch((e) => toast.error(mensagemErro(e)));
  }, []);

  async function salvar() {
    setSalvando(true);
    try {
      const { data } = await api.put('/api/settings', {
        system_prompt_override: prompt,
        modelo,
        agente_ativo_global: ativo,
      });
      setConfig(data);
      toast.success('Configurações salvas — valem para a próxima análise.');
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  if (!config) return <p className="sutil">Carregando…</p>;

  const personalizado = prompt.trim() !== config.prompt_padrao.trim();

  return (
    <section className="configuracoes">
      <div className="secao-topo">
        <h2>Configurações</h2>
        <button className="botao primario" onClick={salvar} disabled={salvando}>
          <Save size={16} /> {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      <div className="cartao linha-config">
        <div>
          <h3>Agente global</h3>
          <p className="sutil">Desligado, as mensagens continuam salvas, mas ninguém recebe resposta.</p>
        </div>
        <Interruptor ligado={ativo} aoMudar={setAtivo} rotulo={ativo ? 'Ligado' : 'Desligado'} />
      </div>

      <div className="cartao linha-config">
        <div>
          <h3>Modelo</h3>
          <p className="sutil">Usado a partir da próxima análise.</p>
        </div>
        <select value={modelo} onChange={(e) => setModelo(e.target.value)} className="mono">
          {config.modelos_disponiveis.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="cartao">
        <div className="secao-topo">
          <div>
            <h3>System prompt {personalizado && <span className="badge amarelo mini">personalizado</span>}</h3>
            <p className="sutil">Os números continuam vindo só da tool, mesmo com o prompt editado.</p>
          </div>
          <button className="botao" onClick={() => setPrompt(config.prompt_padrao)} disabled={!personalizado}>
            <RotateCcw size={16} /> Restaurar padrão
          </button>
        </div>
        <textarea className="mono prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={22} />
      </div>
    </section>
  );
}
