// Convert an audio buffer into normalized loudness samples for visual rendering.
export function computeRmsWaveform(audioBuffer: AudioBuffer, numBars: number = 120): number[] {
  // The first channel is sufficient for this overview visualization and avoids doubling the work.
  const rawData = audioBuffer.getChannelData(0);
  const samplesPerBar = Math.floor(rawData.length / numBars);
  const rmsValues: number[] = [];

  for (let barIndex = 0; barIndex < numBars; barIndex++) {
    let sumSquares = 0;
    const start = barIndex * samplesPerBar;
    const end = Math.min(start + samplesPerBar, rawData.length);
    const count = end - start;

    // Short or empty buffers should still produce a stable number of visual bars.
    if (count === 0) {
      rmsValues.push(0);
      continue;
    }

    for (let sampleIndex = start; sampleIndex < end; sampleIndex++) {
      const sample = rawData[sampleIndex];
      sumSquares += sample * sample;
    }

    rmsValues.push(Math.sqrt(sumSquares / count));
  }

  // Global normalization preserves the relative contrast between loud and quiet sections.
  const maxRms = Math.max(...rmsValues, 0.0001);
  return rmsValues.map((value) => value / maxRms);
}
