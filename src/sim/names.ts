import type { Rng } from './rng';

const START = ['Al', 'Bel', 'Cor', 'Dar', 'El', 'Fen', 'Gal', 'Har', 'Is', 'Jor', 'Kel', 'Lun', 'Mar', 'Nor', 'Or', 'Pel', 'Quin', 'Ros', 'Sel', 'Tor', 'Ul', 'Ven', 'Wyn', 'Yar', 'Zan', 'Ash', 'Brae', 'Cael', 'Dun', 'Eir'];
const MID = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'en', 'or', 'an', ''];
const END = ['dell', 'mere', 'holm', 'wick', 'stead', 'ford', 'reach', 'haven', 'fall', 'moor', 'gate', 'crest', 'vale', 'shore', 'run', 'tor', 'by', 'ness'];

export function makeName(rng: Rng, used: string[]): string {
  for (let attempt = 0; attempt < 40; attempt++) {
    const name = rng.pick(START) + rng.pick(MID) + rng.pick(END);
    if (!used.includes(name)) {
      used.push(name);
      return name;
    }
  }
  const fallback = `Settlement ${used.length + 1}`;
  used.push(fallback);
  return fallback;
}
