export const domains = [
  { id: 'survival', label: '생존', experienceUnit: '에피소드', experienceMax: 1_000_000,
    abilityUnit: '일 평균 생존', abilityScaleUnit: '일', abilityMax: 10 },
  { id: 'judgment', label: '판단' },
  { id: 'perception', label: '환경 인식' },
  { id: 'memory', label: '기억' },
  { id: 'learning', label: '학습' },
  { id: 'development', label: '개발' },
  { id: 'creation', label: '창작' },
  { id: 'assistant', label: '비서' },
];

// Fixed scales are independent of the current dataset. Exact values stay visible
// above the visual cap, and different domains can define their own units.
export function ringFractions(domain, data) {
  return {
    experience: data ? Math.min(1, Math.log10(1 + data.experience) / Math.log10(1 + domain.experienceMax)) : 0,
    ability: data?.ability == null ? 0 : Math.min(1, data.ability / domain.abilityMax),
  };
}
