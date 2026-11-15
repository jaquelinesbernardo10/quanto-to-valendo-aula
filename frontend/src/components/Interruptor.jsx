export default function Interruptor({ ligado, aoMudar, rotulo, desabilitado = false }) {
  return (
    <label className={`interruptor${desabilitado ? ' desabilitado' : ''}`}>
      <input
        type="checkbox"
        checked={ligado}
        disabled={desabilitado}
        onChange={(e) => aoMudar(e.target.checked)}
      />
      <span className="trilho">
        <span className="pino" />
      </span>
      {rotulo && <span>{rotulo}</span>}
    </label>
  );
}
