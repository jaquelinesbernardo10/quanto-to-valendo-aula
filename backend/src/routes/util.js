// Express 4 não captura rejeições de handlers async: encaminha o erro para o middleware de erro.
export const assincrono = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
