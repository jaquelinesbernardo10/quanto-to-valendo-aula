// Extração de texto de PDF. Importa o módulo interno do pdf-parse para evitar o
// "modo debug" do index.js, que tenta ler um PDF de exemplo quando não há module.parent.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { PDFSemTextoError } from './erros.js';

/** Buffer de PDF → texto. Lança PDFSemTextoError se não houver texto extraível. */
export async function extrairTexto(buffer) {
  let resultado;
  try {
    resultado = await pdfParse(buffer);
  } catch {
    throw new PDFSemTextoError('Não consegui ler esse PDF.');
  }
  const texto = (resultado?.text ?? '').replace(/[ \t]+\n/g, '\n').trim();
  if (!texto) throw new PDFSemTextoError();
  return texto;
}
