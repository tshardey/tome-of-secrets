/**
 * PeriodService - Handles period assignment and calculations
 * 
 * Manages assignment of quests to time periods (monthly, weekly, quarterly, yearly).
 * Designed with extensible architecture to support future period types.
 * 
 * Currently implements monthly periods, but designed to easily extend to:
 * - Weekly periods
 * - Quarterly periods  
 * - Yearly periods
 */

/**
 * Period type constants
 * @enum {string}
 */
export const PERIOD_TYPES = {
    MONTHLY: 'monthly',
    WEEKLY: 'weekly',
    QUARTERLY: 'quarterly',
    YEARLY: 'yearly'
};

/**
 * Default period type
 */
const DEFAULT_PERIOD_TYPE = PERIOD_TYPES.MONTHLY;

/**
 * Get the period identifier for a given date
 * For monthly: returns "YYYY-MM" format (e.g., "2026-02")
 * 
 * @param {Date|string} date - Date object or ISO date string
 * @param {string} periodType - Period type (defaults to 'monthly')
 * @returns {string} Period identifier string
 */
export function getPeriodForDate(date, periodType = DEFAULT_PERIOD_TYPE) {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
        console.warn('Invalid date provided to getPeriodForDate:', date);
        return null;
    }
    
    switch (periodType) {
        case PERIOD_TYPES.MONTHLY:
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            return `${year}-${month}`;
            
        case PERIOD_TYPES.WEEKLY:
            // Future implementation: return week identifier
            // For now, fall through to monthly
            console.warn('Weekly periods not yet implemented, using monthly');
            return getPeriodForDate(dateObj, PERIOD_TYPES.MONTHLY);
            
        case PERIOD_TYPES.QUARTERLY:
            // Future implementation: return quarter identifier
            // For now, fall through to monthly
            console.warn('Quarterly periods not yet implemented, using monthly');
            return getPeriodForDate(dateObj, PERIOD_TYPES.MONTHLY);
            
        case PERIOD_TYPES.YEARLY:
            // Future implementation: return year identifier
            // For now, fall through to monthly
            console.warn('Yearly periods not yet implemented, using monthly');
            return getPeriodForDate(dateObj, PERIOD_TYPES.MONTHLY);
            
        default:
            console.warn(`Unknown period type: ${periodType}, using monthly`);
            return getPeriodForDate(dateObj, PERIOD_TYPES.MONTHLY);
    }
}

/**
 * Get period boundaries (start and end dates) for a given date
 * 
 * @param {Date|string} date - Date object or ISO date string
 * @param {string} periodType - Period type (defaults to 'monthly')
 * @returns {Object} Object with startDate and endDate (Date objects)
 */
export function getPeriodBoundaries(date, periodType = DEFAULT_PERIOD_TYPE) {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
        console.warn('Invalid date provided to getPeriodBoundaries:', date);
        return { startDate: null, endDate: null };
    }
    
    switch (periodType) {
        case PERIOD_TYPES.MONTHLY:
            const year = dateObj.getFullYear();
            const month = dateObj.getMonth();
            
            // Start of month
            const startDate = new Date(year, month, 1);
            startDate.setHours(0, 0, 0, 0);
            
            // End of month (first day of next month, minus 1ms)
            const endDate = new Date(year, month + 1, 0);
            endDate.setHours(23, 59, 59, 999);
            
            return { startDate, endDate };
            
        case PERIOD_TYPES.WEEKLY:
        case PERIOD_TYPES.QUARTERLY:
        case PERIOD_TYPES.YEARLY:
            // Future implementations
            console.warn(`${periodType} periods not yet implemented, using monthly boundaries`);
            return getPeriodBoundaries(dateObj, PERIOD_TYPES.MONTHLY);
            
        default:
            console.warn(`Unknown period type: ${periodType}, using monthly boundaries`);
            return getPeriodBoundaries(dateObj, PERIOD_TYPES.MONTHLY);
    }
}

/**
 * Assign a quest to the correct period based on its dates
 * Updates the quest's month/year fields based on dateAdded or dateCompleted
 * 
 * For active quests: uses dateAdded (or current date if not set)
 * For completed quests: uses dateCompleted (or dateAdded if not set)
 * 
 * @param {Object} quest - Quest object
 * @param {string} periodType - Period type (defaults to 'monthly')
 * @returns {Object} Quest object with updated month/year fields
 */
export function assignQuestToPeriod(quest, periodType = DEFAULT_PERIOD_TYPE) {
    if (!quest || typeof quest !== 'object') {
        console.warn('Invalid quest provided to assignQuestToPeriod:', quest);
        return quest;
    }
    
    // Determine which date to use for period assignment
    let assignmentDate = null;
    
    // For completed quests, prefer dateCompleted
    if (quest.dateCompleted) {
        assignmentDate = quest.dateCompleted;
    } 
    // For active quests, use dateAdded
    else if (quest.dateAdded) {
        assignmentDate = quest.dateAdded;
    }
    // Fallback: use current date if no dates are set
    else {
        assignmentDate = new Date().toISOString();
    }
    
    // Get period identifier
    const periodId = getPeriodForDate(assignmentDate, periodType);
    
    if (!periodId) {
        console.warn('Could not determine period for quest:', quest);
        return quest;
    }
    
    // For monthly periods, extract month and year from period ID
    if (periodType === PERIOD_TYPES.MONTHLY) {
        const [year, month] = periodId.split('-');
        
        // Map month number to month name
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const monthIndex = parseInt(month, 10) - 1;
        const monthName = monthNames[monthIndex] || month;
        
        return {
            ...quest,
            month: monthName,
            year: year
        };
    }
    
    // For other period types (future), we'd need to handle differently
    // For now, just return the quest with periodId stored
    return {
        ...quest,
        periodId: periodId
    };
}

/**
 * Group quests by period for display
 * 
 * @param {Array} quests - Array of quest objects
 * @param {string} periodType - Period type (defaults to 'monthly')
 * @returns {Object} Object with period keys and arrays of quests
 */
export function groupQuestsByPeriod(quests = [], periodType = DEFAULT_PERIOD_TYPE) {
    const grouped = {};
    
    quests.forEach(quest => {
        // Assign quest to period (updates month/year)
        const assignedQuest = assignQuestToPeriod(quest, periodType);
        
        // Create period key from month/year
        const periodKey = periodType === PERIOD_TYPES.MONTHLY
            ? `${assignedQuest.year}-${assignedQuest.month}`
            : assignedQuest.periodId || 'unknown';
        
        if (!grouped[periodKey]) {
            grouped[periodKey] = [];
        }
        
        grouped[periodKey].push(assignedQuest);
    });
    
    return grouped;
}

/**
 * Convert numeric month to month name
 * @param {string|number} month - Month number (1-12) or month name
 * @returns {string|null} Month name or null if invalid
 */
function convertNumericMonth(month) {
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    // Try to parse as number
    const monthNum = parseInt(month, 10);
    if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
        return monthNames[monthNum - 1];
    }
    
    return null;
}

/**
 * Check if a month name is valid (or can be converted from numeric or abbreviation)
 * @param {string} month - Month name, number, or abbreviation to validate
 * @returns {boolean} True if valid month name, numeric month (1-12), or valid abbreviation
 */
export function isValidMonthName(month) {
    if (!month || typeof month !== 'string') {
        return false;
    }
    
    const trimmed = month.trim();
    if (!trimmed) {
        return false;
    }
    
    // Check if it's a valid month name
    const validMonths = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    if (validMonths.includes(trimmed)) {
        return true;
    }
    
    // Check if it's a numeric month (1-12)
    const monthNum = parseInt(trimmed, 10);
    if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
        return true;
    }
    
    // Check if it's a valid abbreviation
    if (convertMonthAbbreviation(trimmed)) {
        return true;
    }
    
    return false;
}

/**
 * Convert month abbreviation to full month name
 * @param {string} abbrev - Month abbreviation (e.g., "Jan", "Oct")
 * @returns {string|null} Full month name or null if invalid
 */
function convertMonthAbbreviation(abbrev) {
    if (!abbrev || typeof abbrev !== 'string') {
        return null;
    }
    
    const abbrevLower = abbrev.toLowerCase().trim();
    
    // Map of common abbreviations to full month names
    const abbrevMap = {
        'jan': 'January',
        'feb': 'February',
        'mar': 'March',
        'apr': 'April',
        'may': 'May',
        'jun': 'June',
        'jul': 'July',
        'aug': 'August',
        'sep': 'September',
        'sept': 'September',
        'oct': 'October',
        'nov': 'November',
        'dec': 'December'
    };
    
    return abbrevMap[abbrevLower] || null;
}

/**
 * Normalize month name - converts numeric months and abbreviations to month names
 * @param {string|number} month - Month name, number, or abbreviation
 * @returns {string} Normalized month name
 */
function normalizeMonthName(month) {
    // Handle non-string values (legacy numeric months)
    if (month == null) {
        return '';
    }
    
    // Convert to string if needed
    const monthStr = typeof month === 'string' ? month : String(month);
    const trimmed = monthStr.trim();
    if (!trimmed) {
        return '';
    }
    
    // If already a valid month name, return as-is
    const validMonths = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    if (validMonths.includes(trimmed)) {
        return trimmed;
    }
    
    // Try to convert abbreviation first (before numeric, since "May" could be confused)
    const abbrevConverted = convertMonthAbbreviation(trimmed);
    if (abbrevConverted) {
        return abbrevConverted;
    }
    
    // Try to convert numeric month
    const converted = convertNumericMonth(trimmed);
    if (converted) {
        return converted;
    }
    
    // Return original if can't convert
    return trimmed;
}

/**
 * Normalize year format - ensures 4-digit year
 * @param {string|number} year - Year string or number
 * @returns {string} Normalized year (4 digits) or original if can't normalize
 */
function normalizeYear(year) {
    // Handle non-string values (legacy numeric years)
    if (year == null) {
        return '';
    }
    
    // Convert to string if needed
    const yearStr = typeof year === 'string' ? year : String(year);
    
    // If already 4 digits, return as-is
    if (/^\d{4}$/.test(yearStr)) {
        return yearStr;
    }
    
    // Try to parse and convert 2-digit years (assume 20xx for years < 100)
    const yearNum = parseInt(yearStr, 10);
    if (!isNaN(yearNum)) {
        if (yearNum < 100) {
            // 2-digit year: assume 20xx
            return String(2000 + yearNum);
        } else if (yearNum >= 1000 && yearNum < 10000) {
            // Already 4 digits but might have leading zeros
            return String(yearNum);
        }
    }
    
    // Return original if can't normalize
    return yearStr;
}

/**
 * Normalize quest month/year fields based on dates if they're invalid
 * This fixes quests with typos, abbreviations, numeric months, or other invalid month/year values
 * 
 * @param {Object} quest - Quest object
 * @param {string} periodType - Period type (defaults to 'monthly')
 * @returns {Object} Quest object with normalized month/year
 */
export function normalizeQuestPeriod(quest, periodType = DEFAULT_PERIOD_TYPE) {
    if (!quest || typeof quest !== 'object') {
        return quest;
    }
    
    // Ensure month/year are strings (handle legacy numeric values)
    // Convert numbers to strings, handle null/undefined
    const monthStr = quest.month != null ? String(quest.month) : '';
    const yearStr = quest.year != null ? String(quest.year) : '';
    
    // Empty month/year is valid for unassigned quests (card-drawn quests that haven't been filled in yet)
    // Don't warn or try to fix empty values - they're expected
    const isEmpty = (!monthStr || monthStr.trim() === '') && (!yearStr || yearStr.trim() === '');
    if (isEmpty) {
        return quest;
    }
    
    // Create a quest object with string values for processing
    const questWithStrings = {
        ...quest,
        month: monthStr,
        year: yearStr
    };
    
    // If we have dates, check if we should use them
    // Use dates if month/year are invalid (typos, etc.), but allow normalization of valid abbreviations
    if (questWithStrings.dateAdded || questWithStrings.dateCompleted) {
        // Check if current month/year are valid
        const currentMonthValid = isValidMonthName(questWithStrings.month);
        const currentYearValid = questWithStrings.year && typeof questWithStrings.year === 'string' && /^\d{4}$/.test(questWithStrings.year);
        
        // If invalid, definitely use dates to fix
        if (!currentMonthValid || !currentYearValid) {
            return assignQuestToPeriod(questWithStrings, periodType);
        }
        
        // If valid but year doesn't match date, still use dates for accuracy
        // (abbreviations like "Jan" are valid but we want correct year from dates)
        const dateToUse = questWithStrings.dateCompleted || questWithStrings.dateAdded;
        if (dateToUse) {
            const dateObj = new Date(dateToUse);
            const dateYear = String(dateObj.getFullYear());
            if (questWithStrings.year !== dateYear) {
                // Year mismatch - use dates to get correct period
                return assignQuestToPeriod(questWithStrings, periodType);
            }
        }
    }
    
    // Try to normalize numeric months and years (e.g., "12" -> "December", "25" -> "2025")
    // This handles abbreviations and numeric values when dates aren't available or values are already valid
    let normalizedMonth = normalizeMonthName(questWithStrings.month);
    let normalizedYear = normalizeYear(questWithStrings.year);
    
    // Check if normalized values are valid
    const monthValid = isValidMonthName(normalizedMonth);
    const yearValid = normalizedYear && typeof normalizedYear === 'string' && /^\d{4}$/.test(normalizedYear);
    
    // If no dates available and month/year are still invalid after normalization attempts,
    // only warn if they're truly problematic (not empty, not numeric)
    if (!monthValid || !yearValid) {
        // Only warn for truly invalid values (not empty, not numeric)
        const isNumericMonth = !isNaN(parseInt(normalizedMonth, 10));
        const isNumericYear = !isNaN(parseInt(normalizedYear, 10));
        const isEmptyMonth = !normalizedMonth || normalizedMonth.trim() === '';
        const isEmptyYear = !normalizedYear || normalizedYear.trim() === '';
        
        // Check if month is problematic (invalid, not empty, not numeric)
        const monthProblematic = !monthValid && !isEmptyMonth && !isNumericMonth;
        // Check if year is problematic (invalid, not empty, not numeric)
        const yearProblematic = !yearValid && !isEmptyYear && !isNumericYear;
        
        // Warn if either month or year is problematic
        if (monthProblematic || yearProblematic) {
            // This is a truly problematic value (typo, invalid format, etc.)
            console.warn(`Quest has invalid month/year that couldn't be fixed: month="${normalizedMonth}", year="${normalizedYear}"`);
        }
    }
    
    // Return quest with normalized values (even if still invalid, we tried our best)
    return {
        ...quest,
        month: normalizedMonth,
        year: normalizedYear
    };
}

/**
 * Get period identifier from quest's month/year fields (backward compatibility)
 * 
 * @param {Object} quest - Quest object with month and year fields
 * @returns {string} Period identifier (e.g., "2026-02")
 */
export function getPeriodFromQuest(quest) {
    if (!quest || !quest.month || !quest.year) {
        return null;
    }
    
    // Map month name to number
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const monthIndex = monthNames.indexOf(quest.month);
    if (monthIndex === -1) {
        console.warn('Invalid month name in quest:', quest.month);
        return null;
    }
    
    const month = String(monthIndex + 1).padStart(2, '0');
    return `${quest.year}-${month}`;
}
