// OCR and expense extraction utility
// Processes bill images and extracts amount, date, and category

export interface ExtractedExpenseData {
  amount: number | null;
  currency: string;
  date: string | null; // YYYY-MM-DD
  description: string;
  category: string; // category name
  confidence: number; // 0-1
  rawText: string;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12
};

// Category keywords for automatic categorization
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Groceries': [
    'grocery', 'supermarket', 'whole foods', 'trader joes', 'kroger', 'safeway',
    'walmart', 'target', 'costco', 'food store', 'market', 'fruits', 'vegetables',
    'bread', 'milk', 'eggs', 'produce', 'organic', 'sprouts', 'dmart', 'reliance fresh'
  ],
  'Utilities': [
    'electric', 'water', 'gas', 'power', 'utility', 'phone', 'internet', 'cable',
    'verizon', 'at&t', 'comcast', 'spectrum', 'bill', 'service provider', 'pge', 'jio', 'airtel'
  ],
  'Transportation': [
    'uber', 'lyft', 'taxi', 'gas', 'fuel', 'parking', 'toll', 'car', 'vehicle',
    'shell', 'chevron', 'bp', 'exxon', 'mobil', 'transit', 'metro', 'train',
    'airline', 'flight', 'hotel', 'airbnb', 'booking', 'ola'
  ],
  'Entertainment': [
    'movie', 'cinema', 'theater', 'netflix', 'spotify', 'hulu', 'disney', 'gaming',
    'steam', 'playstation', 'xbox', 'concert', 'ticket', 'entertainment', 'pvr', 'inox'
  ],
  'Health': [
    'pharmacy', 'doctor', 'hospital', 'medical', 'cvs', 'walgreens', 'clinic',
    'dentist', 'therapy', 'health', 'medicine', 'prescription', 'urgent care', 'apollo'
  ],
  'Dining': [
    'restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'food delivery', 'doordash',
    'ubereats', 'grubhub', 'dine', 'bistro', 'bar', 'brewery', 'pub', 'kitchen', 'zomato', 'swiggy'
  ],
  'Shopping': [
    'amazon', 'ebay', 'mall', 'retail', 'store', 'shop', 'clothing', 'apparel',
    'nike', 'adidas', 'zara', 'h&m', 'forever', 'designer', 'fashion', 'shoes', 'flipkart', 'myntra'
  ]
};

// Regex patterns for amount extraction - Updated to handle ₹ and "Total Paid"
const TOTAL_AMOUNT_PATTERNS = [
  /(?:grand\s+total|amount\s+due|balance\s+due|total\s+due|net\s+amount|total\s+paid|total|amount)\s*[:\-]?\s*(?:usd|rs\.?|inr|\$|₹)?\s*([\d,]+(?:\.\d{1,2}|\/-)?)/i,
  /(?:usd|rs\.?|inr|\$|₹)\s*([\d,]+(?:\.\d{1,2}|\/-)?)\s*(?:grand\s+total|amount\s+due|balance\s+due|total\s+due|total)/i
];

const AMOUNT_PATTERNS = [
  /(?:usd|rs\.?|inr|\$|₹)\s*([\d,]+(?:\.\d{1,2}|\/-)?)/gi,
  /([\d,]+(?:\.\d{1,2}|\/-)?)\s*(?:dollars|usd|euro|euros|rs\.?|inr|₹)/gi
];
// Regex patterns for date extraction
const DATE_PATTERNS = [
  /(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/g,           // MM/DD/YYYY or DD/MM/YYYY
  /(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/g,             // YYYY-MM-DD
  /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})[,]?\s+(\d{4})/gi, // Jan 15, 2024
  /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/gi,      // 15 Jan 2024
];

/**
 * Extract structured expense data from OCR text
 */
export function extractExpenseData(ocrText: string): ExtractedExpenseData {
  const text = ocrText.toLowerCase();
  
  // Extract amount
  const amount = extractTotalAmount(ocrText);
  const currency = detectCurrency(ocrText);

  // Extract date
  const date = extractDate(ocrText);

  // Extract category
  const category = detectCategory(text);

  // Extract description
  const description = ocrText.split('\n')[0].substring(0, 100) || 'Bill upload';

  // Calculate confidence (higher if more data points found)
  let confidence = 0.5;
  if (amount !== null) confidence += 0.2;
  if (date !== null) confidence += 0.15;
  if (category !== 'Other') confidence += 0.15;
  confidence = Math.min(confidence, 1);

  return {
    amount,
    currency,
    date,
    description,
    category,
    confidence,
    rawText: ocrText
  };
}

function extractTotalAmount(ocrText: string): number | null {
  // Break text into individual lines
  const lines = ocrText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // 1. Try Line-by-Line with Exact Keywords (Most accurate)
  for (const line of lines) {
    // If the line mentions cash given, tender, or change, SKIP IT
    if (/(subtotal|sub total|tax|change|tender|cash|given|discount|saving)/i.test(line)) {
      continue;
    }

    for (const pattern of TOTAL_AMOUNT_PATTERNS) {
      const match = line.match(pattern);
      const parsed = match?.[1] ? parseAmount(match[1]) : null;
      if (parsed !== null) return parsed;
    }
  }

  // 2. Try floating currency symbols (Safe lines only)
  const amounts: number[] = [];
  for (const line of lines) {
    if (/(change|tender|cash|given)/i.test(line)) continue; // SKIP payment lines

    for (const pattern of AMOUNT_PATTERNS) {
      for (const match of line.matchAll(pattern)) {
        const parsed = parseAmount(match[1]);
        if (parsed !== null) amounts.push(parsed);
      }
    }
  }

  if (amounts.length > 0) {
    return Math.max(...amounts); // Returns the highest safe number
  }

  // 3. ULTIMATE FALLBACK: Find ALL numbers formatted as X.XX or X/- (Safe lines only)
  const fallbackAmounts: number[] = [];
  for (const line of lines) {
    if (/(change|tender|cash|given)/i.test(line)) continue; // SKIP payment lines
    
    const rawNumbers = line.match(/\b\d{1,3}(?:,\d{3})*(?:\.\d{2}|\/-)\b/g);
    if (rawNumbers) {
      const parsedNumbers = rawNumbers.map(n => parseAmount(n)).filter((n): n is number => n !== null);
      fallbackAmounts.push(...parsedNumbers);
    }
  }

  if (fallbackAmounts.length > 0) {
    return Math.max(...fallbackAmounts); // Returns highest safe number
  }

  return null;
}
function parseAmount(value: string): number | null {
  // Removes commas, spaces, and the Indian exact amount suffix "/-"
  const cleaned = value.replace(/,/g, '').replace(/\s/g, '').replace(/\/-$/, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function detectCurrency(ocrText: string): string {
  if (/(₹|\brs\.?\b|\binr\b)/i.test(ocrText)) return 'INR';
  if (/\b(eur|euro|euros)\b/i.test(ocrText)) return 'EUR';
  if (/\bgbp\b|£/i.test(ocrText)) return 'GBP';
  if (/\b(usd|dollars|\$)\b/i.test(ocrText)) return 'USD';
  // Default to INR instead of USD
  return 'INR';
}

function extractDate(ocrText: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(ocrText);
    if (match) {
      const date = parseDateFromMatch(match);
      if (date) return date;
    }
  }

  return null;
}

/**
 * Detect category from text using keyword matching
 */
function detectCategory(text: string): string {
  const textLower = text.toLowerCase();
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (textLower.includes(keyword)) {
        return category;
      }
    }
  }
  
  return 'Other';
}

/**
 * Parse date from regex match
 */
function parseDateFromMatch(match: RegExpMatchArray): string | null {
  try {
    const [, g1, g2, g3] = match;

    let month: number;
    let day: number;
    let year: number;

    if (/^\d{4}$/.test(g1)) {
      year = parseInt(g1);
      month = parseInt(g2);
      day = parseInt(g3);
    } else if (/^[a-z]+$/i.test(g1)) {
      month = MONTH_INDEX[g1.substring(0, 3).toLowerCase()];
      day = parseInt(g2);
      year = parseInt(g3);
    } else if (/^[a-z]+$/i.test(g2)) {
      day = parseInt(g1);
      month = MONTH_INDEX[g2.substring(0, 3).toLowerCase()];
      year = parseInt(g3);
    } else {
      month = parseInt(g1);
      day = parseInt(g2);
      year = parseInt(g3);
    }

    // If year is 2-digit, convert to 4-digit
    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }

    // If first number > 12, it's DD/MM/YYYY format
    if (month > 12) {
      [month, day] = [day, month];
    }

    // Validate date
    if (!month || month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    // Format as YYYY-MM-DD
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

/**
 * Calculate analytics from expenses
 */
export interface ExpenseAnalytics {
  totalAmount: number;
  categoryBreakdown: Record<string, number>;
  monthlyTrend: Record<string, number>;
  averagePerCategory: Record<string, number>;
  topCategory: string;
  expenseCount: number;
  averageExpense: number;
}

type AnalyticsExpense = {
  amount?: number | string | null;
  expense_date?: string | null;
  categories?: {
    name?: string | null;
  } | null;
};

export function calculateAnalytics(expenses: AnalyticsExpense[]): ExpenseAnalytics {
  const categoryBreakdown: Record<string, number> = {};
  const monthlyTrend: Record<string, number> = {};
  let totalAmount = 0;

  for (const expense of expenses) {
    const amount = Number(expense.amount || 0);
    totalAmount += amount;

    // Category breakdown
    const category = expense.categories?.name || 'Other';
    categoryBreakdown[category] = (categoryBreakdown[category] || 0) + amount;

    // Monthly trend
    const month = expense.expense_date?.substring(0, 7) || new Date().toISOString().substring(0, 7);
    monthlyTrend[month] = (monthlyTrend[month] || 0) + amount;
  }

  // Calculate averages
  const averagePerCategory: Record<string, number> = {};
  for (const [category, total] of Object.entries(categoryBreakdown)) {
    const count = expenses.filter(e => (e.categories?.name || 'Other') === category).length;
    averagePerCategory[category] = count > 0 ? total / count : 0;
  }

  const topCategory = Object.entries(categoryBreakdown).sort(([, a], [, b]) => b - a)[0]?.[0] || 'Other';
  const expenseCount = expenses.length;
  const averageExpense = expenseCount > 0 ? totalAmount / expenseCount : 0;

  return {
    totalAmount,
    categoryBreakdown,
    monthlyTrend,
    averagePerCategory,
    topCategory,
    expenseCount,
    averageExpense
  };
}