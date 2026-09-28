function calculateCaseStars({ elapsedSeconds, hintsUsed, wrongAccusations, recommendedTime, thresholds = {} }) {
  const three = thresholds.threeStars || { maxTimeMultiplier: 1, maxHints: 1, maxErrors: 0 };
  const two = thresholds.twoStars || { maxTimeMultiplier: 1.5, maxHints: 2, maxErrors: 1 };
  if (elapsedSeconds <= recommendedTime * three.maxTimeMultiplier
    && hintsUsed <= three.maxHints && wrongAccusations <= three.maxErrors) return 3;
  if (elapsedSeconds <= recommendedTime * two.maxTimeMultiplier
    && hintsUsed <= two.maxHints && wrongAccusations <= two.maxErrors) return 2;
  return 1;
}

module.exports = { calculateCaseStars };
