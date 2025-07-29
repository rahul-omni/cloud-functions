const getTodayDate = () => {

    const today = new Date();

    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const yyyy = today.getFullYear();

    const formattedDate = `${dd}-${mm}-${yyyy}`;

    return formattedDate;  // e.g., "10-07-2025"
}

/**
 * Transforms judgment links array into array of URLs for text[] column
 * @param {Array} judgmentLinks - Array of judgment link objects
 * @returns {Array<string>} Array of URLs for text[] column
 */
const transformJudgmentLinks = (judgmentLinks) => {
    if (!judgmentLinks || !Array.isArray(judgmentLinks)) {
        return [];  // Empty array for text[] column
    }
    // Extract URLs and filter out any invalid entries
    return judgmentLinks
        .filter(link => link && typeof link === 'object' && link.url)
        .map(link => link.url);
};

module.exports = {
    getTodayDate,
    transformJudgmentLinks
};