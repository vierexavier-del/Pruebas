import * as guayaquil from './guayaquil.js';
import * as pichincha from './pichincha.js';

const PARSERS = [guayaquil, pichincha];

/** Detecta el banco por el texto y devuelve el estado de cuenta interpretado. */
export function parseStatement(lines) {
  const text = lines.join('\n');
  const parser = PARSERS.find((p) => p.detect(text));
  if (!parser) {
    throw new Error('No reconozco este estado de cuenta. Por ahora solo Banco Guayaquil y Banco Pichincha.');
  }
  return parser.parse(lines);
}
