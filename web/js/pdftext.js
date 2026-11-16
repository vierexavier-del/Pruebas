// Convierte un PDF en líneas de texto conservando las columnas:
// un hueco grande entre celdas se emite como 3 espacios, uno pequeño como 1.
// Recibe pdfjsLib por parámetro para funcionar igual en navegador y en Node.

export async function extractLines(pdfjsLib, data) {
  const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .filter((i) => typeof i.str === 'string' && i.str.trim() !== '')
      .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);

    const groups = [];
    for (const it of items) {
      const g = groups[groups.length - 1];
      if (g && Math.abs(g.y - it.y) <= 2.5) g.items.push(it);
      else groups.push({ y: it.y, items: [it] });
    }
    for (const g of groups) {
      g.items.sort((a, b) => a.x - b.x);
      let out = '';
      let prevEnd = null;
      for (const it of g.items) {
        if (prevEnd !== null) {
          const gap = it.x - prevEnd;
          out += gap > 7 ? '   ' : gap > 1 ? ' ' : '';
        }
        out += it.str;
        prevEnd = it.x + it.w;
      }
      lines.push(out.trimEnd());
    }
    lines.push('\f'); // fin de página
  }
  return lines;
}
