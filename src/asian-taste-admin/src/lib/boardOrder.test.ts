import { describe, it, expect } from 'vitest';
import { insertInColumn, rankColumn, setColumnOrder, type BoardRanks } from './boardOrder';

/**
 * Tests for the kitchen's own order inside a board column.
 *
 * The board sorts a column oldest-first; this store is the manual override on top of that
 * default. The cases that matter are the seam between ranked and unranked tickets — a new
 * ticket must land at the bottom of the column, not above the arrangement the kitchen set.
 */
describe('insertInColumn', () => {
  it('inserts at the dropped position', () => {
    expect(insertInColumn([1, 2, 3], 9, 1)).toEqual([1, 9, 2, 3]);
  });

  it('removes the id first, so a same-column move does not duplicate it', () => {
    expect(insertInColumn([1, 2, 3], 2, 0)).toEqual([2, 1, 3]);
  });

  it('clamps a position past the end', () => {
    expect(insertInColumn([1, 2], 9, 99)).toEqual([1, 2, 9]);
  });
});

describe('rankColumn', () => {
  const tickets = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it('returns the default order untouched when nothing is ranked', () => {
    expect(rankColumn(tickets, 'placed', {}).map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it('puts ranked tickets first, in rank order', () => {
    const ranks: BoardRanks = { placed: [3, 1] };
    expect(rankColumn(tickets, 'placed', ranks).map((t) => t.id)).toEqual([3, 1, 2]);
  });

  it('leaves a ticket that arrived after the reorder at the bottom', () => {
    // 4 is newer than everything and unranked. It must not jump above 3 and 1.
    const withNew = [...tickets, { id: 4 }];
    const ranks: BoardRanks = { placed: [3, 1] };
    expect(rankColumn(withNew, 'placed', ranks).map((t) => t.id)).toEqual([3, 1, 2, 4]);
  });

  it('only applies the rank for the column asked about', () => {
    const ranks: BoardRanks = { placed: [3, 1] };
    expect(rankColumn(tickets, 'confirmed', ranks).map((t) => t.id)).toEqual([1, 2, 3]);
  });
});

describe('setColumnOrder', () => {
  it('replaces the target order and drops the moved id from the other columns', () => {
    const ranks: BoardRanks = { placed: [1, 2], confirmed: [3, 4] };
    const next = setColumnOrder(ranks, 'confirmed', 2, [3, 2, 4]);
    expect(next.placed).toEqual([1]);
    expect(next.confirmed).toEqual([3, 2, 4]);
  });

  it('omits a column left empty rather than storing an empty list', () => {
    const ranks: BoardRanks = { placed: [1] };
    const next = setColumnOrder(ranks, 'confirmed', 1, [1]);
    expect(next.placed).toBeUndefined();
    expect(next.confirmed).toEqual([1]);
  });
});
