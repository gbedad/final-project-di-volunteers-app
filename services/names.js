// One way to write first and last names in the database:
// "jean DE LA fontaine " -> "Jean de la Fontaine", "ROEDELSPERGER" ->
// "Roedelsperger", "marie - christine" -> "Marie-Christine".

// Lower case when they are not the first word of the field
const PARTICLES = new Set([
  'de',
  'du',
  'des',
  'di',
  'da',
  'del',
  'della',
  'van',
  'von',
  'der',
  'den',
]);
// "la" / "le" are particles only right after "de" ("de la Fontaine")
const AFTER_DE = new Set(['la', 'le']);

const capitalize = (text) =>
  text.charAt(0).toLocaleUpperCase('fr') + text.slice(1).toLocaleLowerCase('fr');

// "McDonald", "DiCaprio": capitals inside the word are kept as typed
const isMixedCase = (text) =>
  text !== text.toLocaleLowerCase('fr') && text !== text.toLocaleUpperCase('fr');

const formatPart = (part) => {
  // O'Brien, N'Diaye: capital after the apostrophe too
  const pieces = part.split(/(['’])/);
  return pieces
    .map((piece) => {
      if (piece === "'" || piece === '’' || !piece) return piece;
      return isMixedCase(piece)
        ? piece.charAt(0).toLocaleUpperCase('fr') + piece.slice(1)
        : capitalize(piece);
    })
    .join('');
};

export const formatName = (value) => {
  if (value === null || value === undefined) return value;
  const cleaned = String(value)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-');
  if (!cleaned) return cleaned;
  const words = cleaned.split(' ');
  return words
    .map((word, index) => {
      const lower = word.toLocaleLowerCase('fr');
      if (index > 0) {
        if (PARTICLES.has(lower)) return lower;
        if (AFTER_DE.has(lower) && words[index - 1].toLowerCase() === 'de') {
          return lower;
        }
        // d'Alembert: the particle stays lower case, the name after it not
        const elided = /^d['’](.+)$/i.exec(word);
        if (elided) return `d'${formatPart(elided[1])}`;
      }
      return word.split('-').map(formatPart).join('-');
    })
    .join(' ');
};

export default formatName;
