/**
 * ShoppingBalanceService - Pure balance math for the shopping page.
 *
 * Balances are allowed to go negative: book box subscriptions arrive whether
 * or not the player can pay, and the log has to be able to record that.
 * These helpers describe the overdraft so the caller can confirm it.
 */

const RESOURCES = ['inkDrops', 'paperScraps'];
const RESOURCE_LABELS = {
    inkDrops: 'Ink Drops',
    paperScraps: 'Paper Scraps'
};

/**
 * @param {{inkDrops?: number, paperScraps?: number}} current - Balance before the purchase
 * @param {{inkDrops?: number, paperScraps?: number}} cost - Total cost of the purchase
 * @returns {Array<{resource: string, label: string, after: number}>} One entry per resource that ends below zero
 */
export function findOverdrafts(current, cost) {
    const overdrafts = [];
    for (const resource of RESOURCES) {
        const after = (current?.[resource] || 0) - (cost?.[resource] || 0);
        if (after < 0) {
            overdrafts.push({ resource, label: RESOURCE_LABELS[resource], after });
        }
    }
    return overdrafts;
}

/**
 * @param {Array<{label: string, after: number}>} overdrafts
 * @returns {string} Confirmation text, or '' when there is no overdraft
 */
export function formatOverdraftPrompt(overdrafts) {
    if (!overdrafts || overdrafts.length === 0) return '';
    const parts = overdrafts.map((o) => `${o.after} ${o.label}`);
    const joined = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
    return `This will put you at ${joined}. Log anyway?`;
}
