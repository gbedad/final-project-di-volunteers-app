// Address suggestions from the national address base (BAN,
// api-adresse.data.gouv.fr: free, no key; the text typed is sent to this
// public service, which does not keep it)
import axios from 'axios';

const BAN = 'https://api-adresse.data.gouv.fr/search/';

// [{ label, street, postcode, city, citycode, lat, lon }]
export const searchAddress = async (text) => {
  const q = String(text || '').trim();
  if (q.length < 3) return [];
  const { data } = await axios.get(BAN, { params: { q: q.slice(0, 200), autocomplete: 1, limit: 6 }, timeout: 6000 });
  return (data.features || []).map((f) => {
    const p = f.properties || {};
    const [lon, lat] = f.geometry?.coordinates || [];
    return {
      label: p.label,
      // "12 Rue de Charenton" (a street or place without number: its name)
      street: p.housenumber ? `${p.housenumber} ${p.street || p.name}` : p.name,
      postcode: p.postcode || '',
      city: p.city || '',
      // INSEE code: Paris districts are 75101…75120
      citycode: p.citycode || null,
      lat: lat ?? null,
      lon: lon ?? null,
    };
  });
};
