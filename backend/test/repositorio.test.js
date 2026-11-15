import { describe, it, expect, beforeEach } from 'vitest';
import { abrirBanco } from '../src/db/database.js';
import { criarRepositorio } from '../src/db/repositorio.js';

let repo;
beforeEach(() => {
  repo = criarRepositorio(abrirBanco(':memory:'));
});

describe('repositório', () => {
  it('conversa é única por (connection_id, remote_jid)', () => {
    const a = repo.obterOuCriarConversa('c1', '5511@s.whatsapp.net', 'Ana');
    const b = repo.obterOuCriarConversa('c1', '5511@s.whatsapp.net');
    const outra = repo.obterOuCriarConversa('c2', '5511@s.whatsapp.net');
    expect(b.id).toBe(a.id);
    expect(outra.id).not.toBe(a.id);
    expect(a.agente_ativo).toBe(true);
  });

  it('lista conversas com a última mensagem e contadores', () => {
    const c = repo.obterOuCriarConversa('c1', 'jid');
    repo.inserirMensagem(c.id, 'usuario', 'oi');
    repo.inserirMensagem(c.id, 'agente', 'olá');
    const [linha] = repo.listarConversas();
    expect(linha).toMatchObject({ ultima_mensagem: 'olá', ultima_papel: 'agente', total_mensagens: 2 });
  });

  it('pagina o histórico em ordem cronológica', () => {
    const c = repo.obterOuCriarConversa('c1', 'jid');
    for (let i = 1; i <= 5; i++) repo.inserirMensagem(c.id, 'usuario', `m${i}`);
    const ultimas = repo.listarMensagens(c.id, { limite: 2 });
    expect(ultimas.map((m) => m.conteudo)).toEqual(['m4', 'm5']);
    const anteriores = repo.listarMensagens(c.id, { limite: 2, antesDe: ultimas[0].id });
    expect(anteriores.map((m) => m.conteudo)).toEqual(['m2', 'm3']);
  });

  it('rejeita papel inválido', () => {
    const c = repo.obterOuCriarConversa('c1', 'jid');
    expect(() => repo.inserirMensagem(c.id, 'robo', 'x')).toThrow();
  });

  it('configurações têm defaults e persistem', () => {
    expect(repo.obterConfiguracoes()).toEqual({
      system_prompt_override: '',
      modelo: null,
      agente_ativo_global: true,
    });
    repo.salvarConfig('agente_ativo_global', '0');
    repo.salvarConfig('modelo', 'claude-haiku-4-5');
    expect(repo.obterConfiguracoes()).toMatchObject({ agente_ativo_global: false, modelo: 'claude-haiku-4-5' });
  });

  it('remover conexão apaga suas conversas e métricas', () => {
    repo.criarConexao('c1', 'Principal');
    const c = repo.obterOuCriarConversa('c1', 'jid');
    repo.inserirMensagem(c.id, 'usuario', 'x');
    expect(repo.metricasConexao('c1')).toEqual({ contatos: 1, mensagens: 1 });
    expect(repo.removerConexao('c1')).toBe(true);
    expect(repo.listarConversas()).toHaveLength(0);
  });
});
