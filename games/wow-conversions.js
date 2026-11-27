// WoW: Forever recipe facts cross-checked against Skillwright and SkillRat.
// Skillwright data build 1.60.1.70009. Market prices always come from Blizzard.
// https://github.com/vBaustad/Skillwright/tree/main/Data
// https://github.com/gitBellucci/SkillRat/blob/main/Data/Recipes.lua
export const conversionModel = 2;
const materialNames = {
  3858: '미스릴 광석', 10620: '토륨 광석', 248815: 'Heavy Thorium Ore',
  12359: '토륨 주괴', 12363: '신비한 수정', 7078: '불의 정수', 7082: '바람의 정수',
  7076: '대지의 정수', 7080: '물의 정수', 12808: '불사의 정수', 12803: '생명의 정수',
  8838: '태양풀', 8839: '실명초', 8925: '수정 약병',
  13467: '얼음송이', 13465: '은초롱이', 10286: '야생의 잎사귀',
};

const definitions = [
  [10097, 3860, '미스릴 주괴 제련', [[3858, 1]]],
  [16153, 12359, '토륨 주괴 제련', [[10620, 1]]],
  [null, 251291, 'Heavy Thorium Bar 제련', [[248815, 1]]],
  [17187, 12360, '아케이나이트 주괴 변환', [[12359, 1], [12363, 1]], true],
  [17559, 7078, '바람 → 불의 정수 변환', [[7082, 1]], true],
  [17560, 7076, '불 → 대지의 정수 변환', [[7078, 1]], true],
  [17561, 7080, '대지 → 물의 정수 변환', [[7076, 1]], true],
  [17562, 7082, '물 → 바람의 정수 변환', [[7080, 1]], true],
  [17563, 7080, '불사 → 물의 정수 변환', [[12808, 1]], true],
  [17564, 12808, '물 → 불사의 정수 변환', [[7080, 1]], true],
  [17565, 7076, '생명 → 대지의 정수 변환', [[12803, 1]], true],
  [17566, 12803, '대지 → 생명의 정수 변환', [[7076, 1]], true],
  [17553, 13443, '최상급 마나 물약 제작', [[8838, 2], [8839, 2], [8925, 1]]],
  [24367, 20008, '활력의 물약 제작', [[13467, 2], [13465, 2], [10286, 2], [8925, 1]]],
];

export const conversions = definitions.map(([recipeId, output, name, inputs, cooldown = false]) => ({
  recipeId, output, name, quantity: 1, cooldown,
  materials: inputs.map(([id, quantity]) => ({ id, quantity, name: materialNames[id] })),
}));
