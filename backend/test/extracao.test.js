import { describe, it, expect } from 'vitest';
import { extrairTexto } from '../src/core/extracao.js';
import { PDFSemTextoError } from '../src/core/erros.js';

// Gera um PDF mínimo válido (1 página) com o texto dado — ou sem texto.
function gerarPdf(texto) {
  const conteudo = texto ? `BT /F1 12 Tf 72 720 Td (${texto}) Tj ET` : '';
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objetos.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

describe('extrairTexto', () => {
  it('extrai o texto de um PDF', async () => {
    expect(await extrairTexto(gerarPdf('Engenheira de Dados Senior'))).toContain('Engenheira de Dados Senior');
  });

  it('PDF sem texto lança PDFSemTextoError', async () => {
    await expect(extrairTexto(gerarPdf(''))).rejects.toBeInstanceOf(PDFSemTextoError);
  });

  it('arquivo corrompido lança PDFSemTextoError', async () => {
    await expect(extrairTexto(Buffer.from('não é pdf'))).rejects.toBeInstanceOf(PDFSemTextoError);
  });
});
