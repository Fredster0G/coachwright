import {
  SectionHeader, Card, Button, Stat, Tag, PRTag, Kbd, Input, Field, Tabs, Avatar,
  Toggle, Checkbox, SegmentedControl, Progress, NumericStepper, Combobox, type ComboboxOption, FileDropzone,
} from '@/design'
import { useState } from 'react'

// Only the design-QA kitchen sink lives here now. The Phase-0 placeholder
// pages (Exercises/Calendar/Business/Reports) were replaced by real pages
// long ago and nothing imported them; removed S25.

const CLIENT_OPTIONS: ComboboxOption[] = [
  { value: 'jordan', label: 'Jordan Fields' },
  { value: 'sam', label: 'Sam Rivera' },
  { value: 'alex', label: 'Alex Chen' },
]

/** Internal design QA route (spec Phase 0 gate). Not linked in nav. */
export function KitchenSink() {
  const [tab, setTab] = useState('a')
  const [toggleOn, setToggleOn] = useState(true)
  const [toggleOff, setToggleOff] = useState(false)
  const [checkA, setCheckA] = useState(true)
  const [checkB, setCheckB] = useState(false)
  const [segment, setSegment] = useState('active')
  const [reps, setReps] = useState(10)
  const [sessions, setSessions] = useState(3.2)
  const [client, setClient] = useState<ComboboxOption | null>(CLIENT_OPTIONS[0])
  const [droppedFile, setDroppedFile] = useState('')

  return (
    <div className="space-y-6">
      <SectionHeader title="Kitchen sink" action={<Button size="sm" onClick={() => document.documentElement.classList.toggle('dark')}>Toggle dark</Button>} />
      <Card className="space-x-2">
        <Button variant="primary">Save program</Button>
        <Button>Export companion</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="destructive">Delete forever</Button>
      </Card>
      <Card className="flex items-center gap-4">
        <Stat label="e1RM" value="315.5" unit="lb" />
        <Stat label="Tonnage" value="12,480" unit="lb" tone="verde" />
        <Stat label="Overdue" value="3" tone="ember" />
        <PRTag>PR ▲ 5 lb</PRTag>
        <Tag tone="verde">active</Tag>
        <Tag tone="ember">7d stale</Tag>
        <Kbd>⌘K</Kbd>
        <Avatar person={{ firstName: 'Jordan', lastName: 'Fields' }} />
      </Card>
      <Card>
        <Tabs tabs={[{ id: 'a', label: 'Overview' }, { id: 'b', label: 'Logs' }]} active={tab} onChange={setTab} />
        <div className="pt-3">
          <Field label="Load" hint="mono numerals"><Input className="font-mono tabular-nums max-w-[120px]" defaultValue="225" /></Field>
        </div>
      </Card>

      {/* Phase 1 design-import primitives — one card per component, each with
          the interactive states that matter (on/off, with/without value,
          disabled), so every one is provable in both themes before any real
          screen consumes it. */}
      <Card className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-faint">Toggle</p>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-ink">
            <Toggle checked={toggleOn} onChange={setToggleOn} label="On example" />On
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <Toggle checked={toggleOff} onChange={setToggleOff} label="Off example" />Off
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <Toggle checked disabled onChange={() => {}} label="Disabled example" />Disabled
          </label>
        </div>

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-faint">Checkbox</p>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-ink">
            <Checkbox checked={checkA} onChange={setCheckA} label="Checked example" />Checked
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <Checkbox checked={checkB} onChange={setCheckB} label="Unchecked example" />Unchecked
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <Checkbox checked disabled onChange={() => {}} label="Disabled example" />Disabled
          </label>
        </div>

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-faint">SegmentedControl</p>
        <SegmentedControl
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'paused', label: 'Paused' },
            { value: 'archived', label: 'Archived', disabled: true, title: 'Not available in this example' },
          ]}
          value={segment}
          onChange={setSegment}
        />

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-faint">Progress</p>
        <div className="max-w-xs space-y-2">
          <Progress value={72} />
          <Progress value={0} />
          <Progress value={100} />
        </div>

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-faint">NumericStepper</p>
        <div className="flex items-center gap-4">
          <div className="w-32"><NumericStepper value={reps} onChange={setReps} min={0} step={1} /></div>
          <div className="w-32"><NumericStepper value={sessions} onChange={setSessions} min={0} step={0.1} /></div>
        </div>

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-faint">Combobox</p>
        <div className="max-w-xs">
          <Combobox options={CLIENT_OPTIONS} value={client} onChange={setClient} placeholder="Switch client…" />
        </div>

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-faint">FileDropzone</p>
        <div className="max-w-xs">
          <FileDropzone accept="image/*" hint="PNG or JPG, up to 2MB" onFile={f => setDroppedFile(f.name)} />
          {droppedFile && <p className="mt-1 text-2xs text-faint">Selected: {droppedFile}</p>}
        </div>
      </Card>
    </div>
  )
}
