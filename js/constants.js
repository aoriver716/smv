export const BOOKS = [
    { title: 'Book I',   first: 1,   last: 41  },
    { title: 'Book II',  first: 42,  last: 72  },
    { title: 'Book III', first: 73,  last: 89  },
    { title: 'Book IV',  first: 90,  last: 106 },
    { title: 'Book V',   first: 107, last: 150 },
];

export const ALPHA = 'abcdefghijklmnopqrstuvwxyz'.split('');

// Words excluded from the concordance because they appear so often
// that they swamp meaningful entries. Currently: articles, basic
// conjunctions, prepositions, and auxiliary verbs (modern + archaic).
export const STOPWORDS = new Set([
    // Articles
    'a', 'an', 'the',
    // Coordinating conjunctions
    'and', 'but', 'or', 'nor', 'so', 'yet', 'for',
    // Prepositions
    'of', 'in', 'on', 'at', 'to', 'from', 'by', 'with', 'as',
    'into', 'unto', 'upon', 'against', 'before', 'after', 'through',
    'throughout', 'between', 'among', 'about', 'without', 'within',
    // Copula / auxiliaries (modern)
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
    'have', 'has', 'had', 'having',
    'do', 'does', 'did',
    'will', 'would', 'shall', 'should', 'may', 'might',
    'can', 'could', 'must',
    // Copula / auxiliaries (archaic)
    'hath', 'hast',
    'doth', 'dost',
    'wilt', 'wert', 'art',
    // Demonstratives / determiners
    'that', 'this', 'these', 'those',
    // Relative / interrogative
    'which', 'who', 'whom', 'whose', 'what',
    'when', 'where', 'why', 'how',
    // Subordinating conjunctions / adverbs
    'if', 'then', 'than', 'because', 'though', 'although',
    'while', 'until', 'since', 'whether',
]);
