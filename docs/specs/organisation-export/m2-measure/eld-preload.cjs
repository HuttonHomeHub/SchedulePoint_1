// Preloaded into the API process for the export measurement (docs/specs/organisation-export/m2-measurements.md).
// Samples event-loop delay with perf_hooks. No signal is used: Nest's shutdown hooks claim SIGUSR2 and the
// process exits on it. Instead the measuring script creates ELD_FILE.reset to ask for a reset, and reads
// ELD_FILE, which is rewritten every 100 ms with {min,mean,p50,p99,max} in milliseconds since the last reset,
// plus the process's memory (rss, V8 heap, external, array buffers) in MB at that moment.
const { monitorEventLoopDelay } = require('node:perf_hooks');
const fs = require('node:fs');

const histogram = monitorEventLoopDelay({ resolution: 10 });
histogram.enable();
const out = process.env.ELD_FILE;
const ms = (ns) => Math.round(ns / 1e4) / 100;

const timer = setInterval(() => {
  if (!out) return;
  if (fs.existsSync(`${out}.reset`)) {
    histogram.reset();
    fs.unlinkSync(`${out}.reset`);
  }
  const memory = process.memoryUsage();
  fs.writeFileSync(
    out,
    JSON.stringify({
      rssMb: Math.round(memory.rss / 1048576),
      heapUsedMb: Math.round(memory.heapUsed / 1048576),
      heapTotalMb: Math.round(memory.heapTotal / 1048576),
      externalMb: Math.round(memory.external / 1048576),
      arrayBuffersMb: Math.round(memory.arrayBuffers / 1048576),
      min: ms(histogram.min),
      mean: ms(histogram.mean),
      p50: ms(histogram.percentile(50)),
      p99: ms(histogram.percentile(99)),
      max: ms(histogram.max),
      samples: histogram.count,
    }),
  );
}, 100);
timer.unref();
