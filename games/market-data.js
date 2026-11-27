const integer = value => Number.isSafeInteger(value) && value > 0;
export function readMarket(value) {
  if (value?.schemaVersion !== 1 || value.region !== 'kr' || value.faction !== 'horde' ||
      value.game !== 'wow-forever' || value.feeBps !== 500 ||
      !['unconnected', 'ready'].includes(value.status) || !Array.isArray(value.picks) ||
      value.picks.length > 10) throw new Error('Invalid market summary');
  if (value.status === 'unconnected') {
    if (value.picks.length || value.observedAt !== null || value.houseId !== null) throw new Error('Invalid empty summary');
  } else if (!integer(value.houseId) || !Number.isFinite(Date.parse(value.observedAt)) ||
      !value.picks.every(item => integer(item?.id) && typeof item.name === 'string' && item.name.length <= 120 &&
        integer(item.buy) && integer(item.reference) && integer(item.quantity) &&
        integer(item.estimatedProfit) && item.estimatedProfit === Math.floor(item.reference * 0.95) - item.buy)) {
    throw new Error('Invalid market result');
  }
  return value;
}
