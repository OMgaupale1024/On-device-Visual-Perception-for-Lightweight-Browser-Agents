// Constant 16x16 white PNG, containing no captured pixels or recognized text.
const BLANK = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAcSURBVDhPY/hPIWBAFyAVjBowagAIjBowGAwAAF14/C6S1TgxAAAAAElFTkSuQmCC';

export async function clearWorkerImage(worker) {
  // In pinned 6.0.1, disabling every recognition output calls SetImage but skips
  // Recognize. Replace the retained raster without reloading the language model.
  await worker.recognize(Uint8Array.from(atob(BLANK), (c) => c.charCodeAt(0)), {}, { text: false, blocks: false });
  await worker.removeFile('/input');
}
