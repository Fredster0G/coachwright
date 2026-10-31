import { describe, it, expect } from 'vitest'
import {
  MODEL_REGISTRY, ALWAYS_INSTALLED_ID, registryIsPermissive,
  classifyHardware, recommendedTier, describeHardware,
  offerFor, offersFor, totalDownloadMb, fitsOnDisk, defaultSelection,
  type HardwareProfile,
} from './localAi'

const minimal: HardwareProfile = { ramGb: 4, cores: 4, hasGpu: false, hasWasmSimd: true }
const standard: HardwareProfile = { ramGb: 8, cores: 8, hasGpu: false, hasWasmSimd: true }
const capable: HardwareProfile = { ramGb: 16, cores: 12, hasGpu: true, hasWasmSimd: true }
const workstation: HardwareProfile = { ramGb: 64, cores: 24, hasGpu: true, vramGb: 16, hasWasmSimd: true }
const unknownRam: HardwareProfile = { ramGb: null, cores: 8, hasGpu: true, hasWasmSimd: true }

describe('model registry — licences are load-bearing', () => {
  it('contains only permissive licences', () => {
    // The reason this is a test and not a comment: YOLOv8/v11-pose is
    // AGPL-3.0 and shipping it would force open-sourcing the entire paid
    // product. Llama and Gemma carry extra terms. A future session adding a
    // model "because it benchmarks well" fails here first.
    expect(registryIsPermissive()).toBe(true)
    for (const m of MODEL_REGISTRY) {
      expect(['MIT', 'Apache-2.0']).toContain(m.licence)
    }
  })

  it('rejects a restricted model if one is ever added', () => {
    const bad = [...MODEL_REGISTRY, {
      ...MODEL_REGISTRY[0], id: 'yolo-pose', licence: 'AGPL-3.0' as never,
    }]
    expect(registryIsPermissive(bad)).toBe(false)
  })

  it('describes every model in the user’s terms, not ours', () => {
    for (const m of MODEL_REGISTRY) {
      expect(m.purpose.length).toBeGreaterThan(25)
      expect(m.sizeMb).toBeGreaterThan(0)
      // Parameter counts describe the model to us; download size is what the
      // user actually waits for.
      expect(m.label).not.toMatch(/\d+B\b/)
    }
  })

  it('ships semantic search to everyone', () => {
    const always = MODEL_REGISTRY.find(m => m.id === ALWAYS_INSTALLED_ID)!
    expect(always.tier).toBe('embeddings')
    expect(always.sizeMb).toBeLessThan(200)
  })
})

describe('classifyHardware', () => {
  it('buckets machines by what they can comfortably run', () => {
    expect(classifyHardware(minimal)).toBe('minimal')
    expect(classifyHardware(standard)).toBe('standard')
    expect(classifyHardware(capable)).toBe('capable')
    expect(classifyHardware(workstation)).toBe('workstation')
  })

  it('says "unknown" rather than guessing when RAM is unavailable', () => {
    // The browser genuinely can't read total RAM — `deviceMemory` is
    // Chrome-only, capped at 8 and rounded. Assuming a class here would put a
    // confident wrong recommendation in front of the user.
    expect(classifyHardware(unknownRam)).toBe('unknown')
  })

  it('does not promote a machine to workstation without the VRAM', () => {
    expect(classifyHardware({ ...workstation, vramGb: 2 })).toBe('capable')
    expect(classifyHardware({ ...workstation, vramGb: null })).toBe('capable')
  })

  it('does not promote to capable without a GPU', () => {
    expect(classifyHardware({ ramGb: 16, cores: 8, hasGpu: false, hasWasmSimd: true })).toBe('standard')
  })
})

describe('recommendedTier — comfort, not maximum', () => {
  it('recommends what runs well, not the largest that fits', () => {
    expect(recommendedTier('workstation')).toBe('pro')
    expect(recommendedTier('capable')).toBe('standard')
    expect(recommendedTier('standard')).toBe('light')
    expect(recommendedTier('minimal')).toBe('embeddings')
  })

  it('falls back to embeddings when the machine is unmeasured', () => {
    expect(recommendedTier('unknown')).toBe('embeddings')
  })
})

describe('offerFor — hardware is the only gate, always with a reason', () => {
  it('never returns an empty reason, whatever the outcome', () => {
    // A greyed row with no explanation is the exact failure this design
    // exists to prevent: the user can't tell if it's their machine or a bug.
    for (const hw of [minimal, standard, capable, workstation, unknownRam]) {
      for (const m of MODEL_REGISTRY) {
        expect(offerFor(m, hw).reason.length).toBeGreaterThan(10)
      }
    }
  })

  it('never gates a model by plan — a free coach on a workstation gets the big ones', () => {
    // S25: models run on the coach's own machine, so every plan gets every
    // model the hardware can run. There is no edition parameter at all.
    const pro = MODEL_REGISTRY.find(m => m.id === 'qwen3-8b-instruct')!
    expect(offerFor(pro, workstation).state).toBe('recommended')
    const ocr = MODEL_REGISTRY.find(m => m.id === 'tesseract-eng')!
    expect(offerFor(ocr, standard).state).not.toBe('blocked-hardware')
  })

  it('blocks on memory with both numbers in the message', () => {
    const big = MODEL_REGISTRY.find(m => m.id === 'qwen3-4b-instruct')!
    const offer = offerFor(big, standard)
    expect(offer.state).toBe('blocked-hardware')
    expect(offer.reason).toMatch(/16 GB/)
    expect(offer.reason).toMatch(/8 GB/)
  })

  it('blocks a GPU-only model on a machine with no GPU', () => {
    const heavy = MODEL_REGISTRY.find(m => m.id === 'pose-heavy')!
    const offer = offerFor(heavy, { ramGb: 32, cores: 16, hasGpu: false, hasWasmSimd: true })
    expect(offer.state).toBe('blocked-hardware')
    expect(offer.reason).toMatch(/GPU/)
  })

  it('offers only embeddings when RAM is unmeasurable, and says why', () => {
    const emb = MODEL_REGISTRY.find(m => m.id === ALWAYS_INSTALLED_ID)!
    const llm = MODEL_REGISTRY.find(m => m.id === 'qwen3-1.7b-instruct')!
    expect(offerFor(emb, unknownRam).state).toBe('recommended')
    const blocked = offerFor(llm, unknownRam)
    expect(blocked.state).toBe('blocked-hardware')
    expect(blocked.reason).toMatch(/desktop app/)
  })

  it('marks a model that fits but will feel slow as available, not recommended', () => {
    // "We can run it" is not the same as "you'll enjoy using it", and the
    // difference is whether the user opens it twice.
    const standardLlm = MODEL_REGISTRY.find(m => m.id === 'qwen3-4b-instruct')!
    const offer = offerFor(standardLlm, { ramGb: 16, cores: 8, hasGpu: false, hasWasmSimd: true })
    expect(offer.state).toBe('available')
    expect(offer.reason).toMatch(/slow/)
  })

  it('recommends the pro assistant only on a workstation', () => {
    const pro = MODEL_REGISTRY.find(m => m.id === 'qwen3-8b-instruct')!
    expect(offerFor(pro, workstation).state).toBe('recommended')
    expect(offerFor(pro, capable).state).not.toBe('recommended')
  })
})

describe('offersFor — ordering', () => {
  it('puts what the user can actually use first, cheapest first', () => {
    const offers = offersFor(capable)
    const states = offers.map(o => o.state)
    const firstBlocked = states.findIndex(s => s.startsWith('blocked'))
    if (firstBlocked >= 0) {
      expect(states.slice(firstBlocked).every(s => s.startsWith('blocked'))).toBe(true)
    }
    const recommended = offers.filter(o => o.state === 'recommended')
    const sizes = recommended.map(o => o.model.sizeMb)
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes)
  })

  it('covers every model exactly once', () => {
    const offers = offersFor(standard)
    expect(offers).toHaveLength(MODEL_REGISTRY.length)
    expect(new Set(offers.map(o => o.model.id)).size).toBe(MODEL_REGISTRY.length)
  })
})

describe('download size and disk', () => {
  it('totals a selection', () => {
    expect(totalDownloadMb(['bge-small-en-v1.5', 'whisper-base'])).toBe(205)
    expect(totalDownloadMb([])).toBe(0)
  })

  it('refuses a download that will not fit, with the numbers', () => {
    const r = fitsOnDisk(['qwen3-8b-instruct'], 1)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/4\.6 GB/)
    expect(r.reason).toMatch(/1\.0 GB free/)
  })

  it('allows it when there is room', () => {
    expect(fitsOnDisk(['qwen3-8b-instruct'], 100).ok).toBe(true)
  })

  it('does not block on an unknown disk figure', () => {
    // Refusing on a number we don't have would stop a download that would
    // have worked fine.
    expect(fitsOnDisk(['qwen3-8b-instruct'], null).ok).toBe(true)
  })
})

describe('defaultSelection', () => {
  it('always includes semantic search', () => {
    for (const hw of [minimal, standard, capable, workstation, unknownRam]) {
      expect(defaultSelection(hw)).toContain(ALWAYS_INSTALLED_ID)
    }
  })

  it('never auto-selects something merely "available"', () => {
    // "We can run it" is not a reason to spend gigabytes of someone's disk
    // without them asking.
    const chosen = defaultSelection(capable)
    const offers = offersFor(capable)
    for (const id of chosen) {
      if (id === ALWAYS_INSTALLED_ID) continue
      expect(offers.find(o => o.model.id === id)!.state).toBe('recommended')
    }
  })

  it('gives a modest machine a small default', () => {
    const mb = totalDownloadMb(defaultSelection(minimal))
    expect(mb).toBeLessThan(300)
  })

  it('strong hardware gets the strongest model by default, whatever the plan', () => {
    expect(defaultSelection(workstation)).toContain('qwen3-8b-instruct')
  })
})

describe('describeHardware', () => {
  it('explains the unmeasured case instead of showing blanks', () => {
    const text = describeHardware(unknownRam, 'unknown')
    expect(text).toMatch(/won’t report/)
    expect(text).toMatch(/desktop app/)
  })

  it('summarises a measured machine', () => {
    const text = describeHardware(capable, 'capable')
    expect(text).toMatch(/16 GB memory/)
    expect(text).toMatch(/GPU available/)
  })

  it('says plainly when there is no GPU rather than omitting it', () => {
    expect(describeHardware(standard, 'standard')).toMatch(/no GPU detected/)
  })
})
