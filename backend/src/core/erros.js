// Erros de domínio do core. Nunca chegam crus ao usuário do WhatsApp:
// o messageHandler os traduz em mensagens amigáveis.

export class PDFSemTextoError extends Error {
  constructor(mensagem = 'O PDF não tem texto extraível.') {
    super(mensagem);
    this.name = 'PDFSemTextoError';
  }
}

export class PerfilSemMatchError extends Error {
  constructor(mensagem = 'Não foi possível encontrar um recorte salarial para o perfil.') {
    super(mensagem);
    this.name = 'PerfilSemMatchError';
  }
}

export class AnaliseInvalidaError extends Error {
  constructor(mensagem = 'O modelo não produziu uma análise válida.') {
    super(mensagem);
    this.name = 'AnaliseInvalidaError';
  }
}
