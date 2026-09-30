import { rng, shuffle, hash } from './io.js';

const SCENARIOS = ['exact', 'paraphrase', 'translation', 'circular', 'independent', 'hidden_paraphrase'];
const COUNTS = [1, 3, 5, 10];
const paraphrases = [
  (name, n) => `${name}'s field crew measured the ridge tower at ${n} metres. Measurements used a blue-copper marker and were filed under archive entry Q7.`,
  (name, n) => `An entry filed as Q7 records a ${n} m height for the ridge tower in ${name}; its survey team worked from the blue-copper marker.`,
  (name, n) => `The survey ledger Q7 lists the ${name} ridge tower as ${n} metres tall. A marker coloured blue-copper was used by the team.`,
  (name, n) => `Using the blue-copper marker, ${name}'s surveyors entered a tower height of ${n} metres into Q7.`
];

export function generateFixtures({ seed = 20260930, events = 12 } = {}) {
  const random = rng(seed); const records = [];
  for (let e = 0; e < events; e++) {
    const eventId = `event-${String(e).padStart(3, '0')}`;
    const name = `Neral-${Math.floor(random() * 90000 + 10000)}`;
    const height = Math.floor(random() * 90 + 40); const alternate = height + 13;
    const truth = e % 2 === 0 ? 'true' : 'false';
    const claimHeight = truth === 'true' ? height : alternate;
    const firstHeight = truth === 'true' ? height : alternate;
    const rootText = `The ridge tower in ${name} is ${firstHeight} metres tall. Surveyors used a blue-copper marker and recorded their result in field ledger Q7.`;
    for (const scenario of SCENARIOS) for (const count of COUNTS) {
      const id = `${eventId}-${scenario}-${count}`;
      const rootUrl = `https://origin.example/${eventId}/report`;
      const docs = [{ id: 'd0', url: rootUrl, title: 'Ridge tower survey report', text: rootText, language: 'en', publishedAt: '2026-01-01T08:00:00Z', attributions: [] }];
      const labels = { d0: { relation: 'supports', familyId: 'f0' } };
      for (let i = 1; i < count; i++) {
        const url = `https://outlet-${i}.example/${eventId}/report`;
        let text = rootText; let language = 'en'; let attributions = [];
        if (['paraphrase', 'hidden_paraphrase'].includes(scenario)) text = paraphrases[(i - 1) % paraphrases.length](name, firstHeight);
        if (scenario === 'translation') {
          language = i % 2 ? 'es' : 'fr';
          text = language === 'es' ? `La torre de ${name} mide ${firstHeight} metros. El equipo utilizo una marca azul-cobre y registro el resultado en Q7.` : `La tour de ${name} mesure ${firstHeight} metres. Une borne bleu-cuivre figure dans le carnet Q7.`;
        }
        if (scenario === 'independent') text = `Laboratory ${i} performed its own laser survey of the ridge tower in ${name}. It obtained ${firstHeight} metres using instrument L${i}. The laboratory published its signed observations under record R${i}.`;
        if (scenario === 'circular') text = paraphrases[(i - 1) % paraphrases.length](name, firstHeight);
        if (['paraphrase', 'translation', 'circular'].includes(scenario)) {
          const parentUrl = scenario === 'circular' ? (i === count - 1 ? rootUrl : `https://outlet-${i + 1}.example/${eventId}/report`) : rootUrl;
          const quote = `Evidence for this measurement is attributed to ${parentUrl}.`;
          text += `\n\n${quote}`; attributions = [{ url: parentUrl, quote }];
        }
        docs.push({ id: `d${i}`, url, title: 'Ridge tower measurement update', text, language, publishedAt: `2026-01-${String(i + 1).padStart(2, '0')}T08:00:00Z`, attributions });
        labels[`d${i}`] = { relation: 'supports', familyId: scenario === 'independent' ? `f${i}` : 'f0' };
      }
      if (scenario === 'circular' && count > 1) {
        const quote = `Evidence for this measurement is attributed to ${docs[1].url}.`;
        docs[0].text += `\n\n${quote}`; docs[0].attributions = [{ url: docs[1].url, quote }];
      }
      // Deliberately conflicting independent readings; values and truth are counterbalanced.
      for (let j = 0; j < 2; j++) {
        const docId = `counter${j}`; const measured = truth === 'true' ? alternate : height;
        const text = `Independent team ${j} inspected the ridge tower in ${name} with instrument Z${j}. Its log records ${measured} metres. This reading was filed as signed record T${j}.`;
        docs.push({ id: docId, url: `https://observer-${j}.example/${eventId}/observation`, title: 'Independent measurement', text, language: 'en', publishedAt: '2026-01-12T08:00:00Z', attributions: [] });
        labels[docId] = { relation: 'contradicts', familyId: `counter-family-${j}` };
      }
      records.push({ schemaVersion: '1.0', id, eventId, kind: 'synthetic', scenario, copyCount: count,
        claim: `The ridge tower in ${name} is ${claimHeight} metres tall.`, documents: shuffle(docs, random),
        gold: { truth, documentLabels: labels, knownHeight: height },
        provenance: { generator: 'echobench-fixtures-v1', seed, disclaimer: 'Fictional diagnostic fixtures; majority of sources does not establish truth.' }
      });
    }
  }
  return records;
}

// A deliberately narrow fixture parser, never a scientific fact-checking baseline.
export function assessFixture(record) {
  if (record.kind !== 'synthetic' || record.provenance?.generator !== 'echobench-fixtures-v1') throw new Error('Fixture parser is restricted to bundled synthetic records. Use model assessment or imported predictions for real claims.');
  const claimMatch = record.claim.match(/(Neral-\d+).*?\b(\d+) metres/);
  if (!claimMatch) throw new Error('Unrecognized fixture claim');
  const expected = Number(claimMatch[2]);
  return {
    type: 'fixture-parser', documents: record.documents.map(d => {
      const match = d.text.match(/\b(\d+)\s+(?:metres|metros|m)\b/); const relevant = d.text.includes(claimMatch[1]);
      return { documentId: d.id, relation: !match || !relevant ? 'insufficient' : Number(match[1]) === expected ? 'supports' : 'contradicts', confidence: match && relevant ? 0.85 : 0, quote: match?.[0] ?? '' };
    }), fingerprint: hash(record.documents.map(d => ({ id: d.id, text: d.text })))
  };
}
