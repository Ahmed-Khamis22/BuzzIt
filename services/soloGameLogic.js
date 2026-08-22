function normalizeArabic(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeForSpelling(value = '') {
  const normalized = normalizeArabic(value);
  return normalized.length > 3 && normalized.startsWith('ال')
    ? normalized.slice(2)
    : normalized;
}

function damerauLevenshtein(firstValue, secondValue) {
  const first = String(firstValue || '');
  const second = String(secondValue || '');
  if (first === second) return 0;
  if (!first) return second.length;
  if (!second) return first.length;

  const matrix = Array.from({ length: first.length + 1 }, () => Array(second.length + 1).fill(0));
  for (let row = 0; row <= first.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= second.length; column += 1) matrix[0][column] = column;

  for (let row = 1; row <= first.length; row += 1) {
    for (let column = 1; column <= second.length; column += 1) {
      const substitutionCost = first[row - 1] === second[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost,
      );
      if (
        row > 1
        && column > 1
        && first[row - 1] === second[column - 2]
        && first[row - 2] === second[column - 1]
      ) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
      }
    }
  }
  return matrix[first.length][second.length];
}

function allowedTypoDistance(value) {
  const length = String(value || '').replace(/\s/g, '').length;
  if (length >= 8) return 2;
  if (length >= 4) return 1;
  return 0;
}

function closestDistance(answer, candidates) {
  let best = Number.POSITIVE_INFINITY;
  let matchedAnswer = null;
  for (const candidate of candidates) {
    const comparable = normalizeForSpelling(candidate);
    if (!comparable) continue;
    const distance = damerauLevenshtein(answer, comparable);
    if (distance < best) {
      best = distance;
      matchedAnswer = candidate;
    }
  }
  return { distance: best, matchedAnswer };
}

function uniqueAlternatives(question) {
  const forbidden = normalizeArabic(question?.answer);
  return [...new Set((question?.acceptedAnswers || []).map(normalizeArabic))]
    .filter((answer) => answer && answer !== forbidden);
}

function answerCount(question) {
  return uniqueAlternatives(question).length;
}

function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function buildDifficultyCurve(questions, limit = 10, random = Math.random) {
  if (!Array.isArray(questions) || questions.length === 0 || limit <= 0) return [];

  const ranked = shuffle(questions, random).sort((first, second) => answerCount(second) - answerCount(first));
  if (ranked.length <= limit) return ranked;

  const selected = [];
  const usedIndexes = new Set();
  for (let round = 0; round < limit; round += 1) {
    const index = Math.round((round * (ranked.length - 1)) / (limit - 1));
    if (!usedIndexes.has(index)) {
      usedIndexes.add(index);
      selected.push(ranked[index]);
    }
  }

  if (selected.length < limit) {
    for (let index = 0; index < ranked.length && selected.length < limit; index += 1) {
      if (!usedIndexes.has(index)) selected.push(ranked[index]);
    }
  }

  return selected.sort((first, second) => answerCount(second) - answerCount(first));
}

function evaluateKnownAnswer(question, rawAnswer) {
  const answer = normalizeArabic(rawAnswer);
  const forbidden = normalizeArabic(question?.answer);
  if (!answer) return { outcome: 'invalid' };
  if (answer === forbidden) return { outcome: 'forbidden' };
  if (uniqueAlternatives(question).includes(answer)) return { outcome: 'valid' };
  return { outcome: 'unknown' };
}

function evaluateContextualAnswer(question, rawAnswer) {
  const normalizedAnswer = normalizeArabic(rawAnswer);
  const answer = normalizeForSpelling(normalizedAnswer);
  if (!answer) return { outcome: 'invalid', method: 'empty', confidence: 1 };

  const forbiddenMatch = closestDistance(answer, [question?.answer].filter(Boolean));
  const validMatch = closestDistance(answer, (question?.acceptedAnswers || []).filter(Boolean));

  if (forbiddenMatch.distance === 0) {
    return {
      outcome: 'forbidden', method: 'normalized_exact', confidence: 1, matchedAnswer: forbiddenMatch.matchedAnswer,
    };
  }
  if (validMatch.distance === 0) {
    return {
      outcome: 'valid', method: 'normalized_exact', confidence: 1, matchedAnswer: validMatch.matchedAnswer,
    };
  }

  const typoLimit = allowedTypoDistance(normalizedAnswer);
  if (typoLimit === 0) return { outcome: 'unknown', method: 'no_safe_match', confidence: 0 };

  const forbiddenIsUniqueBest = forbiddenMatch.distance <= typoLimit
    && forbiddenMatch.distance < validMatch.distance;
  const validIsUniqueBest = validMatch.distance <= typoLimit
    && validMatch.distance < forbiddenMatch.distance;
  const bestMatch = forbiddenIsUniqueBest ? forbiddenMatch : validIsUniqueBest ? validMatch : null;
  if (!bestMatch) return { outcome: 'unknown', method: 'ambiguous_spelling', confidence: 0 };

  return {
    outcome: forbiddenIsUniqueBest ? 'forbidden' : 'valid',
    method: 'contextual_spelling',
    confidence: Math.max(0.8, 1 - (bestMatch.distance / Math.max(answer.length, 1))),
    matchedAnswer: bestMatch.matchedAnswer,
    distance: bestMatch.distance,
  };
}

module.exports = {
  normalizeArabic,
  normalizeForSpelling,
  damerauLevenshtein,
  uniqueAlternatives,
  answerCount,
  buildDifficultyCurve,
  evaluateKnownAnswer,
  evaluateContextualAnswer,
};
