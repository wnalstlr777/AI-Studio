export const farmItems = Object.freeze({
  3858: '미스릴 광석', 10620: '토륨 광석', 248815: 'Heavy Thorium Ore',
  13463: '꿈풀', 13467: '얼음송이', 13465: '은초롱이', 13466: '역병초',
  248821: 'Demonsage', 8838: '태양풀', 8845: '유령버섯',
});

const integer = value => Number.isSafeInteger(value) && value > 0;
const label = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 120;
const limited = (value, check) => value === undefined ||
  (Array.isArray(value) && value.length <= 3 && value.every(check));
export function readMarket(value) {
  if (value?.schemaVersion !== 1 || value.region !== 'kr' || value.faction !== 'horde' ||
      value.game !== 'wow-forever' || value.feeBps !== 500 ||
      !['unconnected', 'ready'].includes(value.status) || !Array.isArray(value.picks) ||
      value.picks.length > 10 ||
      (value.recipesChecked !== undefined && (!Number.isSafeInteger(value.recipesChecked) ||
        value.recipesChecked < 0 || (value.craft?.length ?? 0) > value.recipesChecked)) ||
      !limited(value.farm, item => integer(item?.id) && Object.hasOwn(farmItems, item.id) &&
        integer(item.buy) && Number.isSafeInteger(item.net) && item.net === Math.floor(item.buy * 0.95)) ||
      !limited(value.craft, item => label(item?.name) && integer(item.quantity) && integer(item.cost) &&
        integer(item.receipt) && integer(item.profit) && item.profit === item.receipt - item.cost)) throw new Error('Invalid market summary');
  if (value.status === 'unconnected') {
    if (value.picks.length || value.farm?.length || value.craft?.length || value.observedAt !== null || value.houseId !== null) throw new Error('Invalid empty summary');
  } else if (!integer(value.houseId) || !Number.isFinite(Date.parse(value.observedAt)) ||
      !value.picks.every(item => integer(item?.id) && typeof item.name === 'string' && item.name.length <= 120 &&
        integer(item.buy) && integer(item.reference) && integer(item.quantity) &&
        integer(item.estimatedProfit) && item.estimatedProfit === Math.floor(item.reference * 0.95) - item.buy)) {
    throw new Error('Invalid market result');
  }
  return value;
}
