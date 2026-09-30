import { validateAssessment } from './schema.js';

const logistic = x => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));
export function aggregateEvidence(assessment, graph, { scale = 1.4, acceptThreshold = 0.8 } = {}) {
  if (!Number.isFinite(scale) || scale <= 0 || !(acceptThreshold > 0.5 && acceptThreshold < 1)) throw new Error('Invalid scoring parameters');
  const votes = new Map(assessment.documents.map(d => [d.documentId, d]));
  const familyVotes = graph.families.map(f => {
    const docs = f.members.map(id => votes.get(id)).filter(Boolean);
    const support = Math.max(0, ...docs.filter(d => d.relation === 'supports').map(d => d.confidence));
    const contradict = Math.max(0, ...docs.filter(d => d.relation === 'contradicts').map(d => d.confidence));
    return { familyId: f.id, members: f.members, support, contradict, vote: support - contradict, internallyConflicting: support > 0 && contradict > 0 };
  });
  const score = familyVotes.reduce((sum, f) => sum + f.vote, 0);
  const probabilityTrue = logistic(score / scale);
  const verdict = probabilityTrue >= acceptThreshold ? 'true' : probabilityTrue <= 1 - acceptThreshold ? 'false' : 'unknown';
  const citations = familyVotes.flatMap(f => {
    const relation = f.vote >= 0 ? 'supports' : 'contradicts';
    const ranked = f.members.map(id => votes.get(id)).filter(d => d?.relation === relation).sort((a, b) => b.confidence - a.confidence || a.documentId.localeCompare(b.documentId));
    return ranked.length ? [ranked[0].documentId] : [];
  });
  return { verdict, probabilityTrue, confidenceType: 'uncalibrated_evidence_score', citations, familyVotes,
    supportingFamilyEstimate: familyVotes.filter(f => f.support > 0).length,
    contradictingFamilyEstimate: familyVotes.filter(f => f.contradict > 0).length,
    confirmedIndependentFamilies: null,
    explanation: `Grouped ${assessment.documents.length} documents into ${graph.families.length} estimated source families. Independence remains unverified. The logistic score is a heuristic pending held-out calibration.` };
}

export function analyze(record, assessment, graph, options = {}) {
  validateAssessment(assessment, record.documents);
  const prediction = aggregateEvidence(assessment, graph, options);
  const leaveFamilyOut = graph.families.map(f => {
    const changed = aggregateEvidence(assessment, { ...graph, families: graph.families.filter(x => x.id !== f.id) }, options);
    return { familyId: f.id, members: f.members, probabilityTrue: changed.probabilityTrue, delta: prediction.probabilityTrue - changed.probabilityTrue, verdict: changed.verdict, flipsVerdict: changed.verdict !== prediction.verdict };
  });
  return { ...prediction, leaveFamilyOut, searchPlan: planCorroboration(record, graph, prediction) };
}
export function planCorroboration(record, graph, prediction) {
  const domains = [...new Set(record.documents.map(d => new URL(d.url).hostname))];
  return {
    reason: prediction.verdict === 'unknown' ? 'Resolve conflicting or insufficient evidence with a new primary observation.' : 'Verify the conclusion with evidence whose origin differs from existing lineages.',
    queries: [`"${record.claim.replaceAll('"', '')}" primary record original data`, `${record.claim} correction contradictory evidence`],
    alreadySeenDomains: domains, familyIds: graph.families.map(f => f.id),
    status: 'planned_only', note: 'Queries are not executed automatically; a new domain alone is not new independent evidence.'
  };
}
