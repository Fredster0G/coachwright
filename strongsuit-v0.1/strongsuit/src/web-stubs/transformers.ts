// Website build only (vite.config.ts aliases @huggingface/transformers here
// when VITE_TARGET=web). On-device AI is desktop-only; every entry point is
// already hidden behind LOCAL_AI_ENABLED, so nothing should reach these. If
// something does, it fails loudly instead of pulling a 23MB runtime.
const unavailable = () => { throw new Error('On-device AI is only available in the desktop app.') }
export const pipeline = unavailable
export const cos_sim = unavailable
export class TextStreamer { constructor() { unavailable() } }
